// routes/adminProveedores.js
const express = require('express');
const db = require('../database');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdminAuth);

// GET /SNEOSMART5/admin/api/proveedores
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM contenido c WHERE c.proveedor_id = p.id) AS total_contenido
    FROM proveedores p ORDER BY p.id DESC
  `).all();
  res.json({ ok: true, proveedores: rows });
});

// POST /SNEOSMART5/admin/api/proveedores
router.post('/', (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });
  try {
    const info = db.prepare('INSERT INTO proveedores (nombre, descripcion) VALUES (?, ?)')
      .run(nombre, descripcion || null);
    const nuevo = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ok: true, proveedor: nuevo });
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'Ya existe un proveedor con ese nombre' });
    }
    res.status(500).json({ ok: false, error: 'Error creando proveedor' });
  }
});

// PUT /SNEOSMART5/admin/api/proveedores/:id
router.put('/:id', (req, res) => {
  const { nombre, descripcion } = req.body;
  const p = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'No encontrado' });

  db.prepare('UPDATE proveedores SET nombre = ?, descripcion = ? WHERE id = ?')
    .run(nombre || p.nombre, descripcion !== undefined ? descripcion : p.descripcion, req.params.id);

  const actualizado = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id);
  res.json({ ok: true, proveedor: actualizado });
});

// DELETE /SNEOSMART5/admin/api/proveedores/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM proveedores WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;
