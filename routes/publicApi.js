// routes/publicApi.js
// API pública consumida por la app/cliente, estilo Xtream Codes, SOLO para
// Películas (VOD) y Series. Todo pasa por "player_api.php", diferenciado
// por el parámetro "action".
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');

const router = express.Router();

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function unixSeconds(fechaISO) {
  const t = new Date(fechaISO.includes(' ') ? fechaISO.replace(' ', 'T') + 'Z' : fechaISO + 'T00:00:00Z').getTime();
  return Math.floor((isNaN(t) ? Date.now() : t) / 1000);
}

function construirBaseUrl(req) {
  const esHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  return `${esHttps ? 'https' : 'http'}://${req.get('host')}`;
}

function extraerExtension(url) {
  const sinQuery = (url || '').split('?')[0];
  const partes = sinQuery.split('.');
  return partes.length > 1 ? partes.pop().slice(0, 4) : 'mp4';
}

// Busca al usuario y arma el objeto user_info en formato Xtream.
// Xtream siempre responde 200 OK; el resultado se comunica con "auth": 1/0.
function construirUserInfo(username, password) {
  const u = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);

  const credencialesValidas = !!u && bcrypt.compareSync(password || '', u.password);
  const activo = credencialesValidas && !!u.activo;
  const vencido = credencialesValidas && u.fecha_vencimiento < hoyISO();
  const auth = credencialesValidas && activo && !vencido;

  let status = 'Disabled';
  if (credencialesValidas && activo && vencido) status = 'Expired';
  else if (credencialesValidas && activo && !vencido) status = 'Active';

  return {
    auth,
    user_info: {
      username: username || '',
      password: password || '',
      message: '',
      auth: auth ? 1 : 0,
      status,
      exp_date: u ? String(unixSeconds(u.fecha_vencimiento)) : '0',
      is_trial: '0',
      active_cons: '0',
      created_at: u ? String(unixSeconds(u.creado_en)) : '0',
      max_connections: u ? String(u.max_conexiones) : '1',
      allowed_output_formats: ['m3u8', 'ts', 'mp4'],
    },
  };
}

function construirServerInfo(req) {
  const esHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  return {
    url: req.hostname,
    port: esHttps ? '80' : String(req.socket.localPort || 80),
    https_port: '443',
    server_protocol: esHttps ? 'https' : 'http',
    rtmp_port: '25461',
    timezone: 'America/Argentina/Buenos_Aires',
    timestamp_now: Math.floor(Date.now() / 1000),
    time_now: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
}

/* =========================================================
   PELÍCULAS (VOD)
   ========================================================= */
function obtenerCategoriasPorTipo(tipo) {
  const filas = db.prepare('SELECT DISTINCT categoria FROM contenido WHERE tipo = ? ORDER BY categoria').all(tipo);
  return filas.map((f, i) => ({
    category_id: String(i + 1),
    category_name: f.categoria,
    parent_id: 0,
  }));
}

function obtenerPeliculas(req, username, password) {
  const categorias = obtenerCategoriasPorTipo('movie');
  const filas = db.prepare(`SELECT * FROM contenido WHERE tipo = 'movie' ORDER BY categoria, titulo`).all();
  const base = construirBaseUrl(req);

  const streams = filas.map((c, i) => {
    const cat = categorias.find(cat => cat.category_name === c.categoria);
    const ext = extraerExtension(c.url_stream);
    return {
      num: i + 1,
      name: c.titulo,
      stream_type: 'movie',
      stream_id: c.id,
      stream_icon: c.logo || '',
      rating: 0,
      rating_5based: 0,
      added: String(Math.floor(Date.now() / 1000)),
      category_id: cat ? cat.category_id : '0',
      container_extension: ext,
      custom_sid: '',
      direct_source: `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${c.id}.${ext}`,
      tmdb_id: c.tmdb_id || '',
    };
  });

  return { categorias, streams };
}

function obtenerInfoPelicula(req, username, password, vodId) {
  const c = db.prepare(`SELECT * FROM contenido WHERE id = ? AND tipo = 'movie'`).get(vodId);
  if (!c) return null;
  const ext = extraerExtension(c.url_stream);
  const base = construirBaseUrl(req);
  return {
    info: {
      name: c.titulo,
      tmdb_id: c.tmdb_id || '',
      cover_big: c.logo || '',
      movie_image: c.logo || '',
      category_id: c.categoria,
      plot: '',
      cast: '',
      rating: 0,
    },
    movie_data: {
      stream_id: c.id,
      container_extension: ext,
      direct_source: `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${c.id}.${ext}`,
    },
  };
}

/* =========================================================
   SERIES
   ========================================================= */
// Agrupa episodios por nombre de show, sacando temporada/episodio del
// título si sigue el patrón "Nombre S01E02". Si no matchea, cada entrada
// se trata como una serie de un solo episodio (temporada 1, episodio 1).
function parsearShowYEpisodio(titulo) {
  const m = titulo.match(/^(.*?)[\s._-]*S(\d{1,2})E(\d{1,3})/i);
  if (m) {
    const show = m[1].trim().replace(/[-_.]+$/, '').trim();
    return { show: show || titulo.trim(), temporada: parseInt(m[2], 10), episodio: parseInt(m[3], 10) };
  }
  return { show: titulo.trim(), temporada: 1, episodio: 1 };
}

function obtenerSeriesAgrupadas() {
  const filas = db.prepare(`SELECT * FROM contenido WHERE tipo = 'series' ORDER BY categoria, titulo`).all();
  const grupos = new Map();

  for (const fila of filas) {
    const { show, temporada, episodio } = parsearShowYEpisodio(fila.titulo);
    const key = fila.categoria + '|' + show;
    if (!grupos.has(key)) {
      grupos.set(key, { series_id: fila.id, categoria: fila.categoria, nombre: show, logo: fila.logo, episodios: [] });
    }
    grupos.get(key).episodios.push({ ...fila, temporada, episodio });
  }
  return grupos;
}

function obtenerSeriesParaListado() {
  const categorias = obtenerCategoriasPorTipo('series');
  const grupos = obtenerSeriesAgrupadas();
  const series = [...grupos.values()].map((g, i) => {
    const cat = categorias.find(cat => cat.category_name === g.categoria);
    return {
      num: i + 1,
      name: g.nombre,
      series_id: g.series_id,
      cover: g.logo || '',
      category_id: cat ? cat.category_id : '0',
      plot: '',
      cast: '',
      rating: 0,
      rating_5based: 0,
      last_modified: String(Math.floor(Date.now() / 1000)),
    };
  });
  return { categorias, series };
}

function obtenerInfoSerie(req, username, password, seriesId) {
  const grupos = obtenerSeriesAgrupadas();
  let encontrado = null;
  for (const g of grupos.values()) {
    if (g.series_id === seriesId) { encontrado = g; break; }
  }
  if (!encontrado) return null;

  const base = construirBaseUrl(req);
  const episodesPorTemporada = {};
  for (const ep of encontrado.episodios) {
    const ext = extraerExtension(ep.url_stream);
    const temp = String(ep.temporada);
    if (!episodesPorTemporada[temp]) episodesPorTemporada[temp] = [];
    episodesPorTemporada[temp].push({
      id: String(ep.id),
      episode_num: ep.episodio,
      title: ep.titulo,
      container_extension: ext,
      added: String(Math.floor(Date.now() / 1000)),
      season: ep.temporada,
      direct_source: `${base}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${ep.id}.${ext}`,
    });
  }

  const seasons = Object.keys(episodesPorTemporada)
    .sort((a, b) => Number(a) - Number(b))
    .map(num => ({ season_number: Number(num), name: `Temporada ${num}` }));

  return {
    seasons,
    info: { name: encontrado.nombre, cover: encontrado.logo || '', plot: '', cast: '' },
    episodes: episodesPorTemporada,
  };
}

/* =========================================================
   DISPATCHER: player_api.php
   ========================================================= */
function manejarPlayerApi(req, res) {
  const username = req.query.username || req.body.username;
  const password = req.query.password || req.body.password;
  const action = req.query.action || req.body.action;

  const { auth } = construirUserInfo(username, password);

  if (action) {
    if (!auth) return res.json([]);

    switch (action) {
      case 'get_vod_categories':
        return res.json(obtenerPeliculas(req, username, password).categorias);

      case 'get_vod_streams': {
        const { streams } = obtenerPeliculas(req, username, password);
        const { category_id } = req.query;
        const resultado = category_id ? streams.filter(s => String(s.category_id) === String(category_id)) : streams;
        return res.json(resultado);
      }

      case 'get_vod_info': {
        const vodId = parseInt(req.query.vod_id, 10);
        const info = obtenerInfoPelicula(req, username, password, vodId);
        if (!info) return res.status(404).json({});
        return res.json(info);
      }

      case 'get_series_categories':
        return res.json(obtenerSeriesParaListado().categorias);

      case 'get_series': {
        const { series } = obtenerSeriesParaListado();
        const { category_id } = req.query;
        const resultado = category_id ? series.filter(s => String(s.category_id) === String(category_id)) : series;
        return res.json(resultado);
      }

      case 'get_series_info': {
        const seriesId = parseInt(req.query.series_id, 10);
        const info = obtenerInfoSerie(req, username, password, seriesId);
        if (!info) return res.status(404).json({});
        return res.json(info);
      }

      default:
        return res.json([]);
    }
  }

  // Sin "action" => es el login (player_api.php?username=..&password=..)
  const { user_info } = construirUserInfo(username, password);
  const server_info = construirServerInfo(req);
  return res.json({ user_info, server_info });
}

/* =========================================================
   REPRODUCCIÓN DE STREAMS: /movie y /series
   ========================================================= */
// Patrón estándar que arman los reproductores: /{tipo}/{user}/{pass}/{id}.{ext}
// Valida credenciales y redirige (302) al link real cargado en el panel.
function crearManejadorStream(tipoEsperado) {
  return function (req, res) {
    const { username, password } = req.params;
    const idConExtension = req.params.idConExtension || '';
    const streamId = parseInt(idConExtension.split('.')[0], 10);

    const { auth } = construirUserInfo(username, password);
    if (!auth) return res.status(403).send('Forbidden');
    if (!streamId || isNaN(streamId)) return res.status(404).send('Not found');

    const fila = db.prepare('SELECT url_stream FROM contenido WHERE id = ? AND tipo = ?').get(streamId, tipoEsperado);
    if (!fila) return res.status(404).send('Stream not found');

    res.redirect(302, fila.url_stream);
  };
}

const manejarMovieStream = crearManejadorStream('movie');
const manejarSeriesStream = crearManejadorStream('series');

router.get('/movie/:username/:password/:idConExtension', manejarMovieStream);
router.get('/series/:username/:password/:idConExtension', manejarSeriesStream);

// Endpoint bajo el prefijo custom: /SNEOSMART5/api/player_api.php
router.all('/player_api.php', manejarPlayerApi);

// Alias en la raíz de este router, útil para probar a mano desde el navegador/curl.
router.all('/', manejarPlayerApi);

// Alias sueltos (compatibilidad con apps que usan rutas separadas en vez de "action")
function aliasAccion(accion) {
  return (req, res) => {
    req.query.action = accion;
    manejarPlayerApi(req, res);
  };
}
router.get('/get_vod_categories', aliasAccion('get_vod_categories'));
router.get('/get_vod_streams', aliasAccion('get_vod_streams'));
router.get('/get_vod_info', aliasAccion('get_vod_info'));
router.get('/get_series_categories', aliasAccion('get_series_categories'));
router.get('/get_series', aliasAccion('get_series'));
router.get('/get_series_info', aliasAccion('get_series_info'));

module.exports = router;
module.exports.manejarPlayerApi = manejarPlayerApi;
module.exports.manejarMovieStream = manejarMovieStream;
module.exports.manejarSeriesStream = manejarSeriesStream;
