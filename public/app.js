// ---------- helpers ----------
const $ = (id) => document.getElementById(id);

// Today's date in YOUR timezone, like 2026-11-21
function today() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// 1250 -> "12.50"
const money = (cents) => (cents / 100).toFixed(2);

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

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-content').forEach((s) => {
    s.hidden = s.id !== 'tab-' + name;
  });
  // Load fresh data each time a tab opens
  if (name === 'dashboard') loadDashboard();
  if (name === 'habits') loadHabits();
  if (name === 'expenses') loadExpenses();
}

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
});

// ---------- show the right screen ----------
async function init() {
  const { ok, data } = await api('/api/auth/me');
  if (ok) {
    $('auth-section').hidden = true;
    $('app-section').hidden = false;
    $('user-email').textContent = data.email;
    $('exp-date').value = today();
    showTab('dashboard');
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
    });

    const name = document.createElement('span');
    name.textContent = habit.name; // textContent is safe against XSS

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await api(`/api/habits/${habit.id}`, 'DELETE');
      loadHabits();
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
});

// ---------- dashboard ----------
let weekChart = null;
let todayChart = null;

Chart.defaults.color = '#9fb596';

async function loadDashboard() {
  const [stats, expenses] = await Promise.all([
    api(`/api/stats?date=${today()}`),
    api(`/api/expenses/summary?date=${today()}`),
  ]);

  if (stats.ok) {
    const data = stats.data;
    $('current-streak').textContent = data.currentStreak;
    $('longest-streak').textContent = data.longestStreak;
    $('month-consistency').textContent = data.monthConsistency + '%';
    renderHabitCharts(data);
    renderHeatmap(data.heatmap);
    renderStreaks(data.habits);
  }
  if (expenses.ok) {
    $('month-spent').textContent = money(expenses.data.monthTotal);
  }
}

function renderHabitCharts(data) {
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

// ---------- expenses ----------
let expenseLineChart = null;
let expensePieChart = null;

const CATEGORY_COLORS = {
  Food: '#a6e22e',
  Travel: '#66d9ef',
  Bills: '#fd971f',
  Shopping: '#f92672',
  Health: '#ae81ff',
  Other: '#9fb596',
};

async function loadExpenses() {
  const [summary, list] = await Promise.all([
    api(`/api/expenses/summary?date=${today()}`),
    api('/api/expenses'),
  ]);

  if (summary.ok) {
    $('exp-month-total').textContent = money(summary.data.monthTotal);
    renderExpenseCharts(summary.data);
  }
  if (list.ok) renderExpenseList(list.data);
}

function renderExpenseCharts(data) {
  // Line chart: spending per day, last 30 days
  if (expenseLineChart) expenseLineChart.destroy();
  expenseLineChart = new Chart($('expense-line-chart'), {
    type: 'line',
    data: {
      labels: data.last30.map((d) => d.date.slice(5)), // "11-21"
      datasets: [{
        data: data.last30.map((d) => d.total / 100),
        borderColor: '#a6e22e',
        backgroundColor: 'rgba(166, 226, 46, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Daily spending (last 30 days)' },
      },
      scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true } },
    },
  });

  // Pie chart: this month by category
  const hasData = data.byCategory.length > 0;
  if (expensePieChart) expensePieChart.destroy();
  expensePieChart = new Chart($('expense-pie-chart'), {
    type: 'pie',
    data: {
      labels: hasData ? data.byCategory.map((c) => c.category) : ['No expenses yet'],
      datasets: [{
        data: hasData ? data.byCategory.map((c) => c.total / 100) : [1],
        backgroundColor: hasData
          ? data.byCategory.map((c) => CATEGORY_COLORS[c.category])
          : ['#2a3524'],
        borderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { title: { display: true, text: 'This month by category' } },
    },
  });
}

function renderExpenseList(expenses) {
  const list = $('expense-list');
  list.innerHTML = '';

  expenses.forEach((e) => {
    const li = document.createElement('li');

    const meta = document.createElement('span');
    meta.className = 'exp-meta';
    meta.textContent = e.note ? `${e.category}: ${e.note}` : e.category;
    const date = document.createElement('small');
    date.textContent = ` ${e.date}`;
    meta.appendChild(date);

    const amount = document.createElement('span');
    amount.className = 'exp-amount';
    amount.textContent = money(e.amount_cents);

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await api(`/api/expenses/${e.id}`, 'DELETE');
      loadExpenses();
    });

    li.append(meta, amount, del);
    list.appendChild(li);
  });
}

$('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data } = await api('/api/expenses', 'POST', {
    amount: $('exp-amount').value,
    category: $('exp-category').value,
    note: $('exp-note').value,
    date: $('exp-date').value,
  });
  if (ok) {
    $('expense-error').textContent = '';
    $('exp-amount').value = '';
    $('exp-note').value = '';
    loadExpenses();
  } else {
    $('expense-error').textContent = data.error;
  }
});

init();