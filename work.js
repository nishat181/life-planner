const express = require('express');
const db = require('./db');

const router = express.Router();

const STATUSES = ['todo', 'doing', 'done'];
const isValidDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- daily work log ----------

// READ: my 20 most recent log entries
router.get('/logs', (req, res) => {
  const rows = db.prepare(`
    SELECT id, date, minutes, description
    FROM work_logs
    WHERE user_id = ?
    ORDER BY date DESC, id DESC
    LIMIT 20
  `).all(req.userId);
  res.json(rows);
});

// CREATE: add a log entry
router.post('/logs', (req, res) => {
  const hours = Number(req.body.hours);
  const description = (req.body.description || '').trim().slice(0, 200);
  const date = req.body.date;

  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return res.status(400).json({ error: 'Hours must be between 0 and 24' });
  }
  if (!description) return res.status(400).json({ error: 'Describe what you worked on' });
  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date required' });

  const minutes = Math.round(hours * 60);
  const result = db.prepare(
    'INSERT INTO work_logs (user_id, date, minutes, description) VALUES (?, ?, ?, ?)'
  ).run(req.userId, date, minutes, description);
  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE: remove one of MY log entries
router.delete('/logs/:id', (req, res) => {
  const result = db.prepare('DELETE FROM work_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

// ---------- task board ----------

// READ: all my tasks
router.get('/tasks', (req, res) => {
  const rows = db.prepare(
    'SELECT id, title, status, done_date FROM work_tasks WHERE user_id = ? ORDER BY id'
  ).all(req.userId);
  res.json(rows);
});

// CREATE: add a task (it starts in "To do")
router.post('/tasks', (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title || title.length > 150) {
    return res.status(400).json({ error: 'Title is required (max 150 characters)' });
  }
  const result = db.prepare(
    "INSERT INTO work_tasks (user_id, title, status) VALUES (?, ?, 'todo')"
  ).run(req.userId, title);
  res.status(201).json({ id: result.lastInsertRowid });
});

// UPDATE: move a task to another column
router.post('/tasks/:id/move', (req, res) => {
  const { status, date } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date required' });

  const task = db.prepare('SELECT id FROM work_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!task) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE work_tasks SET status = ?, done_date = ? WHERE id = ?')
    .run(status, status === 'done' ? date : null, task.id);
  res.json({ status });
});

// DELETE: remove one of MY tasks
router.delete('/tasks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM work_tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

// ---------- numbers for cards and charts ----------
router.get('/summary', (req, res) => {
  const today = req.query.date;
  if (!isValidDate(today)) return res.status(400).json({ error: 'Valid date required' });

  // Minutes worked per day, last 14 days
  const start = addDays(today, -13);
  const rows = db.prepare(`
    SELECT date, SUM(minutes) AS minutes
    FROM work_logs
    WHERE user_id = ? AND date BETWEEN ? AND ?
    GROUP BY date
  `).all(req.userId, start, today);

  const byDate = {};
  rows.forEach((r) => { byDate[r.date] = r.minutes; });

  const days14 = [];
  for (let i = 13; i >= 0; i--) {
    const date = addDays(today, -i);
    days14.push({ date, minutes: byDate[date] || 0 });
  }

  const todayMinutes = byDate[today] || 0;
  const weekMinutes = days14.slice(-7).reduce((sum, d) => sum + d.minutes, 0);

  // Tasks completed in each of the last 8 weeks (rolling 7-day windows)
  const doneRows = db.prepare(
    'SELECT done_date FROM work_tasks WHERE user_id = ? AND done_date IS NOT NULL'
  ).all(req.userId);

  const weeks8 = [];
  for (let i = 7; i >= 0; i--) {
    const end = addDays(today, -7 * i);
    const weekStart = addDays(end, -6);
    const count = doneRows.filter((r) => r.done_date >= weekStart && r.done_date <= end).length;
    weeks8.push({ label: weekStart.slice(5), done: count });
  }

  const openTasks = db.prepare(
    "SELECT COUNT(*) AS n FROM work_tasks WHERE user_id = ? AND status != 'done'"
  ).get(req.userId).n;

  res.json({
    todayMinutes,
    weekMinutes,
    doneThisWeek: weeks8[7].done,
    openTasks,
    days14,
    weeks8,
  });
});

module.exports = router;