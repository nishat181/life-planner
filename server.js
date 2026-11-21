require('dotenv').config(); // must be the first line

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
require('./db');
const { router: authRouter } = require('./auth');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Planner running at http://localhost:${PORT}`);
});