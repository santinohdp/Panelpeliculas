// routes/adminUsuarios.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdminAuth);

function serializeUsuario(u) {
  const hoy = new Date().toISOString().slice(0, 10);
  const vencido = u.fecha_vencimiento < hoy;
  return {
    id: u.id,
    username: u.username,
    activo: !!u.activo,
    fecha_vencimiento: u.fecha_vencimiento,
    max_conexiones: u.max_conexiones,
    notas: u.notas,
    creado_en: u.creado_en,
    estado: !u.activo ? 'suspendido' : vencido ? 'vencido' : 'activo',
  };
}

// GET /SNEOSMART5/admin/api/usuarios?buscar=texto
router.get('/', (req, res) => {
  const { buscar } = req.query;
  let rows;
  if (buscar) {
    rows = db.prepare('SELECT * FROM usuarios WHERE username LIKE ? ORDER BY id DESC')
      .all(`%${buscar}%`);
  } else {
    rows = db.prepare('SELECT * FROM usuarios ORDER BY id DESC').all();
  }
  res.json({ ok: true, usuarios: rows.map(serializeUsuario) });
});

// GET /SNEOSMART5/admin/api/usuarios/:id
router.get('/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, usuario: serializeUsuario(u) });
});

// POST /SNEOSMART5/admin/api/usuarios  -> crear cliente
router.post('/', (req, res) => {
  const { username, password, fecha_vencimiento, max_conexiones, notas, activo } = req.body;
  if (!username || !password || !fecha_vencimiento) {
    return res.status(400).json({ ok: false, error: 'username, password y fecha_vencimiento son obligatorios' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(`
      INSERT INTO usuarios (username, password, activo, fecha_vencimiento, max_conexiones, notas)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(username, hash, activo === false ? 0 : 1, fecha_vencimiento, max_conexiones || 1, notas || null);

    const nuevo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ok: true, usuario: serializeUsuario(nuevo) });
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'Ese nombre de usuario ya existe' });
    }
    res.status(500).json({ ok: false, error: 'Error creando usuario' });
  }
});

// PUT /SNEOSMART5/admin/api/usuarios/:id  -> editar credenciales / vencimiento / etc.
router.put('/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: 'No encontrado' });

  const { username, password, fecha_vencimiento, max_conexiones, notas, activo } = req.body;

  const nuevoUsername = username || u.username;
  const nuevoHash = password ? bcrypt.hashSync(password, 10) : u.password;
  const nuevoVenc = fecha_vencimiento || u.fecha_vencimiento;
  const nuevoMax = max_conexiones !== undefined ? max_conexiones : u.max_conexiones;
  const nuevasNotas = notas !== undefined ? notas : u.notas;
  const nuevoActivo = activo !== undefined ? (activo ? 1 : 0) : u.activo;

  try {
    db.prepare(`
      UPDATE usuarios
      SET username = ?, password = ?, fecha_vencimiento = ?, max_conexiones = ?, notas = ?, activo = ?
      WHERE id = ?
    `).run(nuevoUsername, nuevoHash, nuevoVenc, nuevoMax, nuevasNotas, nuevoActivo, req.params.id);

    const actualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
    res.json({ ok: true, usuario: serializeUsuario(actualizado) });
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'Ese nombre de usuario ya existe' });
    }
    res.status(500).json({ ok: false, error: 'Error actualizando usuario' });
  }
});

// PATCH /SNEOSMART5/admin/api/usuarios/:id/estado  -> activar/suspender rápido
router.patch('/:id/estado', (req, res) => {
  const { activo } = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: 'No encontrado' });

  db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, req.params.id);
  const actualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  res.json({ ok: true, usuario: serializeUsuario(actualizado) });
});

// DELETE /SNEOSMART5/admin/api/usuarios/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;
