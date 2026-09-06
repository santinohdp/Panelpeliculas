// server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

require('./database'); // inicializa la DB y corre las migraciones/seed

const publicApiRoutes = require('./routes/publicApi');
const adminAuthRoutes = require('./routes/adminAuth');
const adminUsuariosRoutes = require('./routes/adminUsuarios');
const adminProveedoresRoutes = require('./routes/adminProveedores');
const adminContenidoRoutes = require('./routes/adminContenido');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- API pública consumida por la app/cliente (VOD + Series) ----
app.use('/SNEOSMART5/api', publicApiRoutes);

// También en la raíz del dominio, que es lo que esperan la mayoría de las
// apps IPTV/VOD estándar compatibles con Xtream Codes: arman la URL como
// {servidor}/player_api.php directamente, sin ningún prefijo.
const { manejarPlayerApi, manejarMovieStream, manejarSeriesStream } = publicApiRoutes;
app.all('/player_api.php', manejarPlayerApi);

function aliasAccionRaiz(accion) {
  return (req, res) => {
    req.query.action = accion;
    manejarPlayerApi(req, res);
  };
}
app.get('/get_vod_categories', aliasAccionRaiz('get_vod_categories'));
app.get('/get_vod_streams', aliasAccionRaiz('get_vod_streams'));
app.get('/get_vod_info', aliasAccionRaiz('get_vod_info'));
app.get('/get_series_categories', aliasAccionRaiz('get_series_categories'));
app.get('/get_series', aliasAccionRaiz('get_series'));
app.get('/get_series_info', aliasAccionRaiz('get_series_info'));

// Reproducción real de los streams: /movie/usuario/contraseña/id.ext
//                                    /series/usuario/contraseña/id.ext
app.get('/movie/:username/:password/:idConExtension', manejarMovieStream);
app.get('/series/:username/:password/:idConExtension', manejarSeriesStream);

// ---- API del panel administrativo ----
app.use('/SNEOSMART5/admin/api/auth', adminAuthRoutes);
app.use('/SNEOSMART5/admin/api/usuarios', adminUsuariosRoutes);
app.use('/SNEOSMART5/admin/api/proveedores', adminProveedoresRoutes);
app.use('/SNEOSMART5/admin/api/contenido', adminContenidoRoutes);

// ---- Frontend estático del panel (login + dashboard) ----
app.use(express.static(path.join(__dirname, 'public')));

app.get('/SNEOSMART5/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.redirect('/SNEOSMART5/admin');
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// Manejo de errores genérico
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Backend Películas/Series corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin: http://localhost:${PORT}/SNEOSMART5/admin`);
  console.log(`API cliente: http://localhost:${PORT}/SNEOSMART5/api`);
});
