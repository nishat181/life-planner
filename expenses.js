const express = require('express');
const db = require('./db');

const router = express.Router();

const CATEGORIES = ['Food', 'Travel', 'Bills', 'Shopping', 'Health', 'Other'];
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// READ: my 50 most recent expenses
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, amount_cents, category, note, date
    FROM expenses
    WHERE user_id = ?
    ORDER BY date DESC, id DESC
    LIMIT 50
  `).all(req.userId);
  res.json(rows);
});

// READ: numbers for the charts
router.get('/summary', (req, res) => {
  const today = req.query.date;
  if (!isValidDate(today)) return res.status(400).json({ error: 'Valid date required' });

  const month = today.slice(0, 7); // like "2026-11"

  const monthTotal = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS total
    FROM expenses
    WHERE user_id = ? AND substr(date, 1, 7) = ?
  `).get(req.userId, month).total;

  const byCategory = db.prepare(`
    SELECT category, SUM(amount_cents) AS total
    FROM expenses
    WHERE user_id = ? AND substr(date, 1, 7) = ?
    GROUP BY category
    ORDER BY total DESC
  `).all(req.userId, month);

  const start = addDays(today, -29);
  const daily = db.prepare(`
    SELECT date, SUM(amount_cents) AS total
    FROM expenses
    WHERE user_id = ? AND date BETWEEN ? AND ?
    GROUP BY date
  `).all(req.userId, start, today);

  const byDate = {};
  daily.forEach((r) => { byDate[r.date] = r.total; });

  const last30 = [];
  for (let i = 29; i >= 0; i--) {
    const date = addDays(today, -i);
    last30.push({ date, total: byDate[date] || 0 });
  }

  res.json({ monthTotal, byCategory, last30 });
});

// CREATE: add an expense
router.post('/', (req, res) => {
  const amount = Number(req.body.amount);
  const category = req.body.category;
  const note = (req.body.note || '').trim().slice(0, 100);
  const date = req.body.date;

  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
    return res.status(400).json({ error: 'Enter a valid amount' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Valid date required' });
  }

  const cents = Math.round(amount * 100);
  const result = db.prepare(
    'INSERT INTO expenses (user_id, amount_cents, category, note, date) VALUES (?, ?, ?, ?, ?)'
  ).run(req.userId, cents, category, note, date);

  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE: remove one of MY expenses
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Expense not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;