// database.js
// Usa el módulo integrado "node:sqlite" (Node >= 22.5) — sin dependencias
// nativas, así no hace falta compilar nada (Visual Studio, build tools, etc.)
// ni en Windows ni en Render.
// NOTA: En el plan free de Render el disco NO es persistente entre deploys.
// Cada redeploy/reinicio borra este archivo y arranca de cero.

const path = require('path');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vodseries.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      creado_en TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_vencimiento TEXT NOT NULL,
      max_conexiones INTEGER NOT NULL DEFAULT 1,
      notas TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      descripcion TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contenido (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      url_stream TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'movie',      -- movie | series
      categoria TEXT NOT NULL DEFAULT 'General',
      logo TEXT,
      proveedor_id INTEGER,
      tmdb_id TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_contenido_categoria ON contenido(categoria);
    CREATE INDEX IF NOT EXISTS idx_contenido_tipo ON contenido(tipo);
    CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);
  `);

  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  const existingAdmin = db.prepare('SELECT id FROM admins WHERE username = ?').get(adminUser);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(adminUser, hash);
    console.log(`[DB] Admin creado -> usuario: "${adminUser}" (definí ADMIN_USERNAME / ADMIN_PASSWORD en las env vars de Render para cambiarlo).`);
  }

  const countContenido = db.prepare('SELECT COUNT(*) AS c FROM contenido').get().c;
  if (countContenido === 0) {
    const provId = db.prepare('INSERT INTO proveedores (nombre, descripcion) VALUES (?, ?)')
      .run('Demo Provider', 'Proveedor de ejemplo creado automáticamente').lastInsertRowid;
    db.prepare(`
      INSERT INTO contenido (titulo, url_stream, tipo, categoria, proveedor_id, tmdb_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('Película Demo', 'https://example.com/demo/pelicula.mp4', 'movie', 'General', provId, null);
  }
}

init();

module.exports = db;
