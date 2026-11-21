require('dotenv').config(); // must stay the first line

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
require('./db');
const { router: authRouter, requireAuth } = require('./auth');
const habitsRouter = require('./habits');
const statsRouter = require('./stats');
const expensesRouter = require('./expenses');
const goalsRouter = require('./goals');                          // new line
const countdownsRouter = require('./countdowns');                // new line

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRouter);
app.use('/api/habits', requireAuth, habitsRouter);
app.use('/api/stats', requireAuth, statsRouter);
app.use('/api/expenses', requireAuth, expensesRouter);
app.use('/api/goals', requireAuth, goalsRouter);                 // new line
app.use('/api/countdowns', requireAuth, countdownsRouter);       // new line

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Planner running at http://localhost:${PORT}`);
});