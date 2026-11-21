const express = require('express');
const db = require('./db');

const router = express.Router();

// A date must look like 2026-11-21
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// READ: all my habits, and whether each is done on a date
router.get('/', (req, res) => {
  const date = req.query.date;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date required' });

  const habits = db.prepare(`
    SELECT h.id, h.name,
      EXISTS (SELECT 1 FROM habit_logs l WHERE l.habit_id = h.id AND l.date = ?) AS done
    FROM habits h
    WHERE h.user_id = ?
    ORDER BY h.id
  `).all(date, req.userId);

  res.json(habits.map((h) => ({ ...h, done: Boolean(h.done) })));
});

// CREATE: add a habit
router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Name is required (max 100 characters)' });
  }
  const result = db.prepare('INSERT INTO habits (user_id, name) VALUES (?, ?)').run(req.userId, name);
  res.status(201).json({ id: result.lastInsertRowid, name, done: false });
});

// UPDATE: tick or untick a habit for a date
router.post('/:id/toggle', (req, res) => {
  const { date } = req.body;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date required' });

  // ownership check
  const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  const existing = db.prepare('SELECT id FROM habit_logs WHERE habit_id = ? AND date = ?').get(habit.id, date);
  if (existing) {
    db.prepare('DELETE FROM habit_logs WHERE id = ?').run(existing.id);
    res.json({ done: false });
  } else {
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habit.id, date);
    res.json({ done: true });
  }
});

// DELETE: remove a habit and its logs
router.delete('/:id', (req, res) => {
  const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  db.prepare('DELETE FROM habit_logs WHERE habit_id = ?').run(habit.id);
  db.prepare('DELETE FROM habits WHERE id = ?').run(habit.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;