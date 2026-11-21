const express = require('express');
const db = require('./db');

const router = express.Router();

const isValidDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- journal with mood ----------

// READ: my 30 most recent entries
router.get('/journal', (req, res) => {
  const rows = db.prepare(`
    SELECT id, date, mood, note
    FROM journal
    WHERE user_id = ?
    ORDER BY date DESC
    LIMIT 30
  `).all(req.userId);
  res.json(rows);
});

// CREATE or REPLACE: one entry per day (an "upsert")
router.put('/journal', (req, res) => {
  const mood = Number(req.body.mood);
  const note = (req.body.note || '').trim().slice(0, 500);
  const date = req.body.date;

  if (!Number.isInteger(mood) || mood < 1 || mood > 5) {
    return res.status(400).json({ error: 'Mood must be between 1 and 5' });
  }
  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date required' });

  db.prepare(`
    INSERT INTO journal (user_id, date, mood, note) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, date) DO UPDATE SET mood = excluded.mood, note = excluded.note
  `).run(req.userId, date, mood, note);
  res.json({ message: 'Saved' });
});

// DELETE: remove one of MY entries
router.delete('/journal/:id', (req, res) => {
  const result = db.prepare('DELETE FROM journal WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

// ---------- study log ----------

// READ: my 20 most recent study entries
router.get('/study', (req, res) => {
  const rows = db.prepare(`
    SELECT id, skill, date, minutes
    FROM study_logs
    WHERE user_id = ?
    ORDER BY date DESC, id DESC
    LIMIT 20
  `).all(req.userId);
  res.json(rows);
});

// CREATE: add a study entry
router.post('/study', (req, res) => {
  const skill = (req.body.skill || '').trim().slice(0, 60);
  const hours = Number(req.body.hours);
  const date = req.body.date;

  if (!skill) return res.status(400).json({ error: 'Skill name is required' });
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return res.status(400).json({ error: 'Hours must be between 0 and 24' });
  }
  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date required' });

  const result = db.prepare(
    'INSERT INTO study_logs (user_id, skill, date, minutes) VALUES (?, ?, ?, ?)'
  ).run(req.userId, skill, date, Math.round(hours * 60));
  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE: remove one of MY study entries
router.delete('/study/:id', (req, res) => {
  const result = db.prepare('DELETE FROM study_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

// ---------- numbers for cards and charts ----------
router.get('/summary', (req, res) => {
  const today = req.query.date;
  if (!isValidDate(today)) return res.status(400).json({ error: 'Valid date required' });

  const start30 = addDays(today, -29);

  // Mood for each of the last 30 days (null = no entry)
  const entries = db.prepare(
    'SELECT date, mood FROM journal WHERE user_id = ? AND date BETWEEN ? AND ?'
  ).all(req.userId, start30, today);

  const moodByDate = {};
  entries.forEach((e) => { moodByDate[e.date] = e.mood; });

  const mood30 = [];
  for (let i = 29; i >= 0; i--) {
    const date = addDays(today, -i);
    mood30.push({ date, mood: moodByDate[date] || null });
  }

  // Average mood over the last 7 days (only days that have an entry)
  const last7 = mood30.slice(-7).filter((d) => d.mood !== null);
  const avgMood7 = last7.length
    ? Math.round((last7.reduce((sum, d) => sum + d.mood, 0) / last7.length) * 10) / 10
    : null;

  // Study time per skill, last 30 days
  const bySkill = db.prepare(`
    SELECT skill, SUM(minutes) AS minutes
    FROM study_logs
    WHERE user_id = ? AND date BETWEEN ? AND ?
    GROUP BY skill COLLATE NOCASE
    ORDER BY minutes DESC
  `).all(req.userId, start30, today);

  // Study minutes in the last 7 days
  const studyWeekMinutes = db.prepare(`
    SELECT COALESCE(SUM(minutes), 0) AS minutes
    FROM study_logs
    WHERE user_id = ? AND date BETWEEN ? AND ?
  `).get(req.userId, addDays(today, -6), today).minutes;

  res.json({
    mood30,
    avgMood7,
    journalDays: entries.length,
    bySkill,
    studyWeekMinutes,
  });
});

module.exports = router;