// middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-este-secreto-en-produccion';

function requireAdminAuth(req, res, next) {
  const token = req.cookies?.admin_token || (req.headers.authorization || '').replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('rol inválido');
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
  }
}

module.exports = { requireAdminAuth, JWT_SECRET };
