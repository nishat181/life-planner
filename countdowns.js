const express = require('express');
const db = require('./db');

const router = express.Router();

const isValidDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

// READ: my countdowns, soonest first
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, title, target_date FROM countdowns WHERE user_id = ? ORDER BY target_date'
  ).all(req.userId);
  res.json(rows);
});

// CREATE: add a countdown
router.post('/', (req, res) => {
  const title = (req.body.title || '').trim();
  const date = req.body.date;
  if (!title || title.length > 60) return res.status(400).json({ error: 'Title is required (max 60 characters)' });
  if (!isValidDate(date)) return res.status(400).json({ error: 'Pick a valid date' });

  const result = db.prepare('INSERT INTO countdowns (user_id, title, target_date) VALUES (?, ?, ?)').run(req.userId, title, date);
  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE: remove one of MY countdowns
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM countdowns WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;