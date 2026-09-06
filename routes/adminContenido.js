// routes/adminContenido.js
const express = require('express');
const db = require('../database');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdminAuth);

// Parsea el texto de una lista M3U/M3U8 extendida y devuelve un array de
// { titulo, url_stream, categoria, logo, tmdb_id }. Soporta variantes comunes:
//   #EXTINF:-1 tvg-logo="..." group-title="Categoria" tmdb-id="123",Nombre
//   #EXTINF:-1 tvg-logo='...' group-title='Categoria',Nombre del Canal
//   #EXTGRP:Categoria   (línea aparte, algunos exports la usan en vez de group-title)
function parsearM3U(texto) {
  const lineas = texto.split(/\r?\n/);
  const items = [];
  let actual = null;
  let grupoExtGrp = null;

  for (const lineaCruda of lineas) {
    const linea = lineaCruda.trim();
    if (!linea) continue;

    if (linea.toUpperCase().startsWith('#EXTGRP:')) {
      grupoExtGrp = linea.slice(8).trim() || null;
      continue;
    }

    if (linea.toUpperCase().startsWith('#EXTINF')) {
      const logoMatch = linea.match(/tvg-logo=["']([^"']*)["']/i);
      const grupoMatch = linea.match(/group-title=["']([^"']*)["']/i);
      const tmdbMatch = linea.match(/tmdb-id=["']([^"']*)["']/i);
      const nombreMatch = linea.match(/,([^,]*)$/);
      const categoriaCruda = (grupoMatch ? grupoMatch[1] : grupoExtGrp) || '';
      actual = {
        logo: logoMatch ? logoMatch[1] : '',
        categoria: categoriaCruda.trim() || 'General',
        titulo: (nombreMatch ? nombreMatch[1] : 'Canal sin nombre').trim(),
        tmdb_id: tmdbMatch ? tmdbMatch[1].trim() : null,
      };
      grupoExtGrp = null; // ya se consumió, solo aplica al canal siguiente
    } else if (!linea.startsWith('#') && actual) {
      actual.url_stream = linea;
      items.push(actual);
      actual = null;
    }
  }
  return items;
}

// GET /SNEOSMART5/admin/api/contenido?categoria=&proveedor_id=&buscar=&tipo=
router.get('/', (req, res) => {
  const { categoria, proveedor_id, buscar, tipo } = req.query;
  let sql = `
    SELECT c.*, p.nombre AS proveedor_nombre
    FROM contenido c
    LEFT JOIN proveedores p ON p.id = c.proveedor_id
    WHERE 1=1
  `;
  const params = [];

  if (categoria) { sql += ' AND c.categoria = ?'; params.push(categoria); }
  if (proveedor_id) { sql += ' AND c.proveedor_id = ?'; params.push(proveedor_id); }
  if (buscar) { sql += ' AND c.titulo LIKE ?'; params.push(`%${buscar}%`); }
  if (tipo) { sql += ' AND c.tipo = ?'; params.push(tipo); }

  sql += ' ORDER BY c.id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ ok: true, contenido: rows });
});

// GET /SNEOSMART5/admin/api/contenido/categorias?tipo=live|movie|series
// (sin "tipo" trae categorías de todo; con "tipo" solo las de ese tipo)
router.get('/categorias', (req, res) => {
  const { tipo } = req.query;
  const sql = tipo
    ? `SELECT categoria, COUNT(*) AS total FROM contenido WHERE tipo = ? GROUP BY categoria ORDER BY categoria`
    : `SELECT categoria, COUNT(*) AS total FROM contenido GROUP BY categoria ORDER BY categoria`;
  const rows = tipo ? db.prepare(sql).all(tipo) : db.prepare(sql).all();
  res.json({ ok: true, categorias: rows });
});

// POST /SNEOSMART5/admin/api/contenido/importar-m3u
// Body: {
//   url?: string,               -> el servidor descarga la lista de esta URL
//   contenido_m3u?: string,     -> o mandás el texto ya pegado (prioridad si vienen los dos)
//   proveedor_id?: number,      -> se asigna a todo lo importado en esta tanda
//   tipo?: 'live'|'movie'|'series',   -> por defecto 'live'
//   filtro_categoria?: string,  -> si viene, solo se importan los canales cuya
//                                   categoría CONTENGA este texto (sin distinguir may/min)
// }
router.post('/importar-m3u', async (req, res) => {
  const { url, contenido_m3u, proveedor_id, tipo, filtro_categoria } = req.body;
  const tipoFinal = ['live', 'movie', 'series'].includes(tipo) ? tipo : 'live';
  let texto = contenido_m3u;

  if (!texto && url) {
    try {
      const resp = await fetch(url, {
        headers: {
          // Muchos paneles IPTV rechazan pedidos sin un User-Agent de
          // reproductor "real" (anti-scraping). Simulamos uno típico.
          'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        },
        signal: AbortSignal.timeout(30000),
        redirect: 'follow',
      });
      if (!resp.ok) {
        return res.status(400).json({ ok: false, error: `El servidor de la lista respondió con error HTTP ${resp.status}` });
      }
      texto = await resp.text();
    } catch (err) {
      // err.cause suele traer el motivo real (DNS, timeout, conexión rechazada, etc.)
      const causa = err.cause?.message || err.cause?.code || err.message;
      return res.status(400).json({ ok: false, error: `No se pudo descargar la URL: ${causa}` });
    }
  }

  if (!texto || !texto.trim()) {
    return res.status(400).json({ ok: false, error: 'Falta la URL o el contenido de la lista M3U' });
  }

  let items = parsearM3U(texto);
  if (items.length === 0) {
    return res.status(400).json({ ok: false, error: 'No se encontraron canales válidos en esa lista' });
  }

  if (filtro_categoria && filtro_categoria.trim()) {
    const filtro = filtro_categoria.trim().toLowerCase();
    items = items.filter(item => item.categoria.toLowerCase().includes(filtro));
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: `Ningún canal de la lista tiene una categoría que contenga "${filtro_categoria}"` });
    }
  }

  const insertar = db.prepare(`
    INSERT INTO contenido (titulo, url_stream, tipo, categoria, logo, proveedor_id, tmdb_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const item of items) {
      insertar.run(item.titulo, item.url_stream, tipoFinal, item.categoria, item.logo || null, proveedor_id || null, item.tmdb_id || null);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ ok: false, error: 'Error guardando los canales: ' + err.message });
  }

  res.status(201).json({ ok: true, importados: items.length });
});

// POST /SNEOSMART5/admin/api/contenido
router.post('/', (req, res) => {
  const { titulo, url_stream, tipo, categoria, logo, proveedor_id, tmdb_id } = req.body;
  if (!titulo || !url_stream) {
    return res.status(400).json({ ok: false, error: 'titulo y url_stream son obligatorios' });
  }
  const info = db.prepare(`
    INSERT INTO contenido (titulo, url_stream, tipo, categoria, logo, proveedor_id, tmdb_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(titulo, url_stream, tipo || 'live', categoria || 'General', logo || null, proveedor_id || null, tmdb_id || null);

  const nuevo = db.prepare('SELECT * FROM contenido WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ok: true, contenido: nuevo });
});

// PUT /SNEOSMART5/admin/api/contenido/:id
router.put('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM contenido WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'No encontrado' });

  const { titulo, url_stream, tipo, categoria, logo, proveedor_id, tmdb_id } = req.body;

  db.prepare(`
    UPDATE contenido
    SET titulo = ?, url_stream = ?, tipo = ?, categoria = ?, logo = ?, proveedor_id = ?, tmdb_id = ?
    WHERE id = ?
  `).run(
    titulo || c.titulo,
    url_stream || c.url_stream,
    tipo || c.tipo,
    categoria || c.categoria,
    logo !== undefined ? logo : c.logo,
    proveedor_id !== undefined ? proveedor_id : c.proveedor_id,
    tmdb_id !== undefined ? tmdb_id : c.tmdb_id,
    req.params.id
  );

  const actualizado = db.prepare('SELECT * FROM contenido WHERE id = ?').get(req.params.id);
  res.json({ ok: true, contenido: actualizado });
});

// DELETE /SNEOSMART5/admin/api/contenido/categoria/:categoria
// Borra TODOS los canales que pertenezcan a esa categoría de una sola vez.
router.delete('/categoria/:categoria', (req, res) => {
  const categoria = req.params.categoria;
  const info = db.prepare('DELETE FROM contenido WHERE categoria = ?').run(categoria);
  res.json({ ok: true, eliminados: info.changes });
});

// DELETE /SNEOSMART5/admin/api/contenido/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM contenido WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;
