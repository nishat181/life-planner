// ---------- helpers ----------
const $ = (id) => document.getElementById(id);

// Today's date in YOUR timezone, like 2026-11-21
function today() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// Sends a request to the server and returns { ok, data }
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

// ---------- show the right screen ----------
async function init() {
  const { ok, data } = await api('/api/auth/me');
  if (ok) {
    $('auth-section').hidden = true;
    $('app-section').hidden = false;
    $('user-email').textContent = data.email;
    loadHabits();
    loadStats();
  } else {
    $('auth-section').hidden = false;
    $('app-section').hidden = true;
  }
}

// ---------- login / register / logout ----------
async function submitAuth(action) {
  const { ok, data } = await api(`/api/auth/${action}`, 'POST', {
    email: $('email').value,
    password: $('password').value,
  });
  if (ok) {
    $('auth-error').textContent = '';
    $('password').value = '';
    init();
  } else {
    $('auth-error').textContent = data.error;
  }
}

$('login-btn').addEventListener('click', () => submitAuth('login'));
$('register-btn').addEventListener('click', () => submitAuth('register'));
$('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', 'POST');
  init();
});

// ---------- habits ----------
async function loadHabits() {
  const { data } = await api(`/api/habits?date=${today()}`);
  const list = $('habit-list');
  list.innerHTML = '';

  data.forEach((habit) => {
    const li = document.createElement('li');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = habit.done;
    box.addEventListener('change', async () => {
      await api(`/api/habits/${habit.id}/toggle`, 'POST', { date: today() });
      loadStats(); // refresh the dashboard
    });

    const name = document.createElement('span');
    name.textContent = habit.name; // textContent is safe against XSS

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await api(`/api/habits/${habit.id}`, 'DELETE');
      loadHabits();
      loadStats();
    });

    li.append(box, name, del);
    list.appendChild(li);
  });
}

$('habit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/habits', 'POST', { name: $('habit-name').value });
  $('habit-name').value = '';
  loadHabits();
  loadStats();
});

// ---------- dashboard ----------
let weekChart = null;
let todayChart = null;

Chart.defaults.color = '#9fb596';

async function loadStats() {
  const { ok, data } = await api(`/api/stats?date=${today()}`);
  if (!ok) return;

  $('current-streak').textContent = data.currentStreak;
  $('longest-streak').textContent = data.longestStreak;
  $('month-consistency').textContent = data.monthConsistency + '%';

  renderCharts(data);
  renderHeatmap(data.heatmap);
  renderStreaks(data.habits);
}

function renderCharts(data) {
  // Bar chart: completion % for each of the last 7 days
  if (weekChart) weekChart.destroy();
  weekChart = new Chart($('week-chart'), {
    type: 'bar',
    data: {
      labels: data.week.map((d) => d.label),
      datasets: [{
        data: data.week.map((d) => d.percent),
        backgroundColor: '#a6e22e',
        borderRadius: 4,
      }],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Weekly progress (%)' },
      },
    },
  });

  // Doughnut chart: habits done today vs remaining
  const done = data.todayDone;
  const left = Math.max(data.totalHabits - done, 0);
  if (todayChart) todayChart.destroy();
  todayChart = new Chart($('today-chart'), {
    type: 'doughnut',
    data: {
      labels: ['Done', 'Left'],
      datasets: [{
        data: data.totalHabits === 0 ? [0, 1] : [done, left],
        backgroundColor: ['#a6e22e', '#2a3524'],
        borderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { title: { display: true, text: 'Today' } },
    },
  });
}

function renderHeatmap(days) {
  const map = $('heatmap');
  map.innerHTML = '';

  // Pad so the first day lands on the right weekday row (Monday = row 1)
  const firstWeekday = (new Date(days[0].date + 'T00:00:00Z').getUTCDay() + 6) % 7;
  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'cell empty';
    map.appendChild(empty);
  }

  days.forEach((day) => {
    const cell = document.createElement('div');
    let level = 0;
    if (day.percent >= 100) level = 4;
    else if (day.percent >= 67) level = 3;
    else if (day.percent >= 34) level = 2;
    else if (day.percent > 0) level = 1;
    cell.className = level ? `cell l${level}` : 'cell';
    cell.title = `${day.date}: ${day.percent}%`; // hover to see
    map.appendChild(cell);
  });
}

function renderStreaks(habits) {
  const list = $('streak-list');
  list.innerHTML = '';
  habits.forEach((h) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = h.name;
    const streak = document.createElement('strong');
    streak.textContent = `${h.streak} day${h.streak === 1 ? '' : 's'}`;
    li.append(name, streak);
    list.appendChild(li);
  });
}

init();