const express = require('express');
const db = require('./db');

const router = express.Router();

const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// Adds (or subtracts) days from a date like "2026-11-21"
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Days in a row, counting back from today (or yesterday if today isn't done yet)
function currentStreak(dates, today) {
  let day = dates.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (dates.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

// Longest run of consecutive days ever
function longestStreak(dates) {
  const sorted = [...dates].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

router.get('/', (req, res) => {
  const today = req.query.date;
  if (!isValidDate(today)) return res.status(400).json({ error: 'Valid date required' });

  const habits = db.prepare('SELECT id, name FROM habits WHERE user_id = ? ORDER BY id').all(req.userId);
  const logs = db.prepare(`
    SELECT l.habit_id, l.date
    FROM habit_logs l
    JOIN habits h ON h.id = l.habit_id
    WHERE h.user_id = ?
  `).all(req.userId);

  const total = habits.length;
  const countByDate = {};  // "2026-11-21" -> how many habits done that day
  const datesByHabit = {}; // habit id -> set of dates it was done

  for (const log of logs) {
    countByDate[log.date] = (countByDate[log.date] || 0) + 1;
    if (!datesByHabit[log.habit_id]) datesByHabit[log.habit_id] = new Set();
    datesByHabit[log.habit_id].add(log.date);
  }

  const percentOn = (date) =>
    total === 0 ? 0 : Math.min(100, Math.round(((countByDate[date] || 0) / total) * 100));

  // Last 7 days, for the bar chart
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const label = new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'UTC',
    });
    week.push({ date, label, percent: percentOn(date) });
  }

  // Last 16 weeks (112 days), for the heatmap
  const heatmap = [];
  for (let i = 111; i >= 0; i--) {
    const date = addDays(today, -i);
    heatmap.push({ date, percent: percentOn(date) });
  }

  // Days with at least one habit done
  const activeDates = new Set(Object.keys(countByDate));

  // This month's consistency: average completion from the 1st until today
  const daysSoFar = parseInt(today.slice(8), 10);
  const monthStart = today.slice(0, 8) + '01';
  let sum = 0;
  for (let i = 0; i < daysSoFar; i++) sum += percentOn(addDays(monthStart, i));

  res.json({
    totalHabits: total,
    todayDone: countByDate[today] || 0,
    currentStreak: currentStreak(activeDates, today),
    longestStreak: longestStreak(activeDates),
    monthConsistency: Math.round(sum / daysSoFar),
    week,
    heatmap,
    habits: habits.map((h) => ({
      id: h.id,
      name: h.name,
      streak: currentStreak(datesByHabit[h.id] || new Set(), today),
    })),
  });
});

module.exports = router;