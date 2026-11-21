const express = require('express');
const path = require('path');
require('./db'); // runs db.js so the tables exist

const app = express();
const PORT = 3000;

app.use(express.json());                              // lets the server read JSON sent by the browser
app.use(express.static(path.join(__dirname, 'public'))); // serves your HTML/CSS/JS

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Planner running at http://localhost:${PORT}`);
});