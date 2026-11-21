const express = require('express');
const db = require('./db');

const router = express.Router();

const KINDS = ['project', 'skill'];
const isValidDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

// READ: all my goals with their tasks, plus overall numbers
router.get('/', (req, res) => {
  const today = req.query.date;
  if (!isValidDate(today)) return res.status(400).json({ error: 'Valid date required' });

  const goals = db.prepare('SELECT id, kind, name FROM goals WHERE user_id = ? ORDER BY id').all(req.userId);
  const tasks = db.prepare(
    'SELECT id, goal_id, title, due_date, done_date FROM tasks WHERE user_id = ? ORDER BY id'
  ).all(req.userId);

  // Group tasks under their goal
  const tasksByGoal = {};
  tasks.forEach((t) => {
    if (!tasksByGoal[t.goal_id]) tasksByGoal[t.goal_id] = [];
    tasksByGoal[t.goal_id].push({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      done: t.done_date !== null,
      overdue: t.done_date === null && t.due_date !== null && t.due_date < today,
    });
  });

  const result = goals.map((g) => {
    const list = tasksByGoal[g.id] || [];
    const done = list.filter((t) => t.done).length;
    return {
      id: g.id,
      kind: g.kind,
      name: g.name,
      total: list.length,
      done,
      percent: list.length ? Math.round((done / list.length) * 100) : 0,
      tasks: list,
    };
  });

  // Overall numbers
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.done_date !== null).length;
  const completionPercent = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const pendingPercent = totalTasks ? 100 - completionPercent : 0;
  const overdueCount = tasks.filter((t) => t.done_date === null && t.due_date !== null && t.due_date < today).length;

  // Efficiency: of tasks with a due date that are finished or overdue,
  // how many were finished on or before the due date?
  let counted = 0;
  let credit = 0;
  tasks.forEach((t) => {
    if (t.due_date === null) return;
    if (t.done_date !== null) {
      counted++;
      credit += t.done_date <= t.due_date ? 1 : 0.5; // late work earns half credit
    } else if (t.due_date < today) {
      counted++; // overdue and not done earns nothing
    }
  });
  const efficiency = counted ? Math.round((credit / counted) * 100) : null;

  res.json({
    summary: { totalTasks, doneTasks, completionPercent, pendingPercent, overdueCount, efficiency },
    goals: result,
  });
});

// CREATE: add a project or a skill
router.post('/', (req, res) => {
  const kind = req.body.kind;
  const name = (req.body.name || '').trim();
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Choose project or skill' });
  if (!name || name.length > 100) return res.status(400).json({ error: 'Name is required (max 100 characters)' });

  const result = db.prepare('INSERT INTO goals (user_id, kind, name) VALUES (?, ?, ?)').run(req.userId, kind, name);
  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE: remove a goal and all of its tasks
router.delete('/:id', (req, res) => {
  const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!goal) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM tasks WHERE goal_id = ?').run(goal.id);
  db.prepare('DELETE FROM goals WHERE id = ?').run(goal.id);
  res.json({ message: 'Deleted' });
});

// CREATE: add a task to a goal
router.post('/:id/tasks', (req, res) => {
  const title = (req.body.title || '').trim();
  const due = req.body.due_date || null;

  if (!title || title.length > 150) return res.status(400).json({ error: 'Task title is required (max 150 characters)' });
  if (due !== null && !isValidDate(due)) return res.status(400).json({ error: 'Invalid due date' });

  const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!goal) return res.status(404).json({ error: 'Not found' });

  const result = db.prepare(
    'INSERT INTO tasks (goal_id, user_id, title, due_date) VALUES (?, ?, ?, ?)'
  ).run(goal.id, req.userId, title, due);
  res.status(201).json({ id: result.lastInsertRowid });
});

// UPDATE: tick or untick a task
router.post('/tasks/:taskId/toggle', (req, res) => {
  const { date } = req.body;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Valid date required' });

  const task = db.prepare('SELECT id, done_date FROM tasks WHERE id = ? AND user_id = ?').get(req.params.taskId, req.userId);
  if (!task) return res.status(404).json({ error: 'Not found' });

  const newValue = task.done_date === null ? date : null;
  db.prepare('UPDATE tasks SET done_date = ? WHERE id = ?').run(newValue, task.id);
  res.json({ done: newValue !== null });
});

// DELETE: remove one task
router.delete('/tasks/:taskId', (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.taskId, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;