// ===================================================
//  Projects & Skills
// ===================================================
let goalBarChart = null;
let goalDoughnutChart = null;

function byId(id) {
  return document.getElementById(id);
}

const showEfficiency = (value) => (value === null ? '—' : value + '%');

// Small numbers for the dashboard cards
async function loadGoalsSummary() {
  const { ok, data } = await api(`/api/goals?date=${today()}`);
  if (!ok) return;
  byId('pending-work').textContent = data.summary.pendingPercent + '%';
  byId('efficiency').textContent = showEfficiency(data.summary.efficiency);
}

// Everything on the Projects & Skills tab
async function loadGoals() {
  const { ok, data } = await api(`/api/goals?date=${today()}`);
  if (!ok) return;

  const s = data.summary;
  byId('goal-completion').textContent = s.completionPercent + '%';
  byId('goal-pending').textContent = s.pendingPercent + '%';
  byId('goal-efficiency').textContent = showEfficiency(s.efficiency);
  byId('goal-overdue').textContent = s.overdueCount;

  renderGoalCharts(data);
  renderGoalList(data.goals);
}

function renderGoalCharts(data) {
  const s = data.summary;

  // Bar chart: progress % of each project/skill
  if (goalBarChart) goalBarChart.destroy();
  goalBarChart = new Chart(byId('goal-bar-chart'), {
    type: 'bar',
    data: {
      labels: data.goals.map((g) => g.name),
      datasets: [{
        data: data.goals.map((g) => g.percent),
        backgroundColor: data.goals.map((g) => (g.kind === 'project' ? '#a6e22e' : '#66d9ef')),
        borderRadius: 4,
      }],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Progress per item (%)' },
      },
    },
  });

  // Doughnut: all tasks, done vs pending
  const pending = s.totalTasks - s.doneTasks;
  if (goalDoughnutChart) goalDoughnutChart.destroy();
  goalDoughnutChart = new Chart(byId('goal-doughnut-chart'), {
    type: 'doughnut',
    data: {
      labels: ['Done', 'Pending'],
      datasets: [{
        data: s.totalTasks === 0 ? [0, 1] : [s.doneTasks, pending],
        backgroundColor: ['#a6e22e', '#2a3524'],
        borderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { title: { display: true, text: 'Work done vs pending' } },
    },
  });
}

function renderGoalList(goals) {
  const box = byId('goal-list');
  box.innerHTML = '';

  goals.forEach((g) => {
    const wrap = document.createElement('div');
    wrap.className = 'goal';

    // Header: name, badge, percent, delete
    const head = document.createElement('div');
    head.className = 'goal-head';

    const title = document.createElement('strong');
    title.textContent = g.name; // textContent is safe against XSS

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = g.kind === 'project' ? 'Project' : 'Skill';

    const pct = document.createElement('span');
    pct.className = 'goal-pct';
    pct.textContent = `${g.percent}% (${g.done}/${g.total})`;

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!confirm(`Delete "${g.name}" and all its tasks?`)) return;
      await api(`/api/goals/${g.id}`, 'DELETE');
      loadGoals();
    });

    head.append(title, badge, pct, del);

    // Progress bar
    const bar = document.createElement('div');
    bar.className = 'progress';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = g.percent + '%';
    bar.appendChild(fill);

    // Task list
    const ul = document.createElement('ul');
    g.tasks.forEach((t) => {
      const li = document.createElement('li');

      const box2 = document.createElement('input');
      box2.type = 'checkbox';
      box2.checked = t.done;
      box2.addEventListener('change', async () => {
        await api(`/api/goals/tasks/${t.id}/toggle`, 'POST', { date: today() });
        loadGoals();
      });

      const name = document.createElement('span');
      name.textContent = t.title;

      li.append(box2, name);

      if (t.due_date) {
        const due = document.createElement('span');
        due.className = t.overdue ? 'due overdue' : 'due';
        due.textContent = (t.overdue ? 'Overdue: ' : 'Due ') + t.due_date;
        li.appendChild(due);
      }

      const rm = document.createElement('button');
      rm.textContent = 'X';
      rm.addEventListener('click', async () => {
        await api(`/api/goals/tasks/${t.id}`, 'DELETE');
        loadGoals();
      });
      li.appendChild(rm);

      ul.appendChild(li);
    });

    // Form to add a task to this goal
    const form = document.createElement('form');
    form.className = 'inline-form';
    const taskInput = document.createElement('input');
    taskInput.type = 'text';
    taskInput.placeholder = g.kind === 'project' ? 'New task' : 'New topic';
    taskInput.maxLength = 150;
    taskInput.required = true;
    const dueInput = document.createElement('input');
    dueInput.type = 'date';
    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.textContent = 'Add';
    form.append(taskInput, dueInput, addBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await api(`/api/goals/${g.id}/tasks`, 'POST', {
        title: taskInput.value,
        due_date: dueInput.value || null,
      });
      loadGoals();
    });

    wrap.append(head, bar, ul, form);
    box.appendChild(wrap);
  });
}

byId('goal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data } = await api('/api/goals', 'POST', {
    kind: byId('goal-kind').value,
    name: byId('goal-name').value,
  });
  if (ok) {
    byId('goal-error').textContent = '';
    byId('goal-name').value = '';
    loadGoals();
  } else {
    byId('goal-error').textContent = data.error;
  }
});

// ===================================================
//  Countdowns
// ===================================================

// Whole days from today to a date like "2026-12-25"
function daysUntil(dateStr) {
  const target = Date.parse(dateStr + 'T00:00:00Z');
  const now = Date.parse(today() + 'T00:00:00Z');
  return Math.round((target - now) / 86400000);
}

async function loadCountdowns() {
  const { ok, data } = await api('/api/countdowns');
  if (!ok) return;

  // Upcoming first, past events after
  const upcoming = data.filter((c) => daysUntil(c.target_date) >= 0);
  const past = data.filter((c) => daysUntil(c.target_date) < 0);

  const list = byId('countdown-list');
  list.innerHTML = '';

  [...upcoming, ...past].forEach((c) => {
    const d = daysUntil(c.target_date);

    const card = document.createElement('div');
    card.className = d < 0 ? 'countdown past' : 'countdown';

    const num = document.createElement('div');
    num.className = 'cd-num';
    num.textContent = d === 0 ? 'Today!' : Math.abs(d);

    const label = document.createElement('div');
    label.className = 'cd-label';
    label.textContent = d > 0 ? 'days left' : d < 0 ? 'days ago' : '';

    const title = document.createElement('div');
    title.className = 'cd-title';
    title.textContent = c.title;

    const date = document.createElement('small');
    date.textContent = c.target_date;

    const del = document.createElement('button');
    del.textContent = 'X';
    del.addEventListener('click', async () => {
      await api(`/api/countdowns/${c.id}`, 'DELETE');
      loadCountdowns();
    });

    card.append(num, label, title, date, del);
    list.appendChild(card);
  });
}

byId('countdown-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data } = await api('/api/countdowns', 'POST', {
    title: byId('cd-title').value,
    date: byId('cd-date').value,
  });
  if (ok) {
    byId('countdown-error').textContent = '';
    byId('cd-title').value = '';
    byId('cd-date').value = '';
    loadCountdowns();
  } else {
    byId('countdown-error').textContent = data.error;
  }
});