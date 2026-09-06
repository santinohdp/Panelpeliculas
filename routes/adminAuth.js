// routes/adminAuth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET, requireAdminAuth } = require('../middleware/auth');

const router = express.Router();

// POST /SNEOSMART5/admin/api/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, JWT_SECRET, {
    expiresIn: '12h',
  });

  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });

  res.json({ ok: true, username: admin.username });
});

// POST /SNEOSMART5/admin/api/logout
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

// GET /SNEOSMART5/admin/api/me  -> chequea si la sesión sigue válida
router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ ok: true, admin: { username: req.admin.username } });
});

// POST /SNEOSMART5/admin/api/change-password
router.post('/change-password', requireAdminAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Faltan datos' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(currentPassword, admin.password)) {
    return res.status(401).json({ ok: false, error: 'Contraseña actual incorrecta' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hash, admin.id);
  res.json({ ok: true });
});

module.exports = router;
