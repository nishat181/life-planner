// ===================================================
//  Shared helpers
// ===================================================
let workHoursChart = null;
let workWeeksChart = null;
let moodChart = null;
let studyPieChart = null;

const MOOD_LABELS = ['', 'Very low', 'Low', 'Okay', 'Good', 'Great'];
const STUDY_COLORS = ['#a6e22e', '#66d9ef', '#fd971f', '#f92672', '#ae81ff', '#e6db74', '#9fb596'];

// 90 -> "1.5"
const fmtHours = (minutes) => (minutes / 60).toFixed(1);

// Small numbers for the dashboard cards
async function loadWorkGrowthSummary() {
  const [work, growth] = await Promise.all([
    api(`/api/work/summary?date=${today()}`),
    api(`/api/growth/summary?date=${today()}`),
  ]);
  if (work.ok) byId('dash-work-hours').textContent = fmtHours(work.data.weekMinutes);
  if (growth.ok) {
    byId('dash-study-hours').textContent = fmtHours(growth.data.studyWeekMinutes);
    byId('dash-mood').textContent = growth.data.avgMood7 === null ? '—' : growth.data.avgMood7;
  }
}

// ===================================================
//  WORK TAB
// ===================================================
async function loadWork() {
  if (!byId('wl-date').value) byId('wl-date').value = today();

  const [summary, logs, tasks] = await Promise.all([
    api(`/api/work/summary?date=${today()}`),
    api('/api/work/logs'),
    api('/api/work/tasks'),
  ]);

  if (summary.ok) {
    const s = summary.data;
    byId('work-today').textContent = fmtHours(s.todayMinutes);
    byId('work-week').textContent = fmtHours(s.weekMinutes);
    byId('work-done-week').textContent = s.doneThisWeek;
    byId('work-open').textContent = s.openTasks;
    renderWorkCharts(s);
  }
  if (logs.ok) renderWorkLogs(logs.data);
  if (tasks.ok) renderBoard(tasks.data);
}

function renderWorkCharts(s) {
  // Bar chart: hours worked per day, last 14 days
  if (workHoursChart) workHoursChart.destroy();
  workHoursChart = new Chart(byId('work-hours-chart'), {
    type: 'bar',
    data: {
      labels: s.days14.map((d) => d.date.slice(5)),
      datasets: [{
        data: s.days14.map((d) => Math.round((d.minutes / 60) * 100) / 100),
        backgroundColor: '#a6e22e',
        borderRadius: 4,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Hours worked (last 14 days)' },
      },
      scales: { x: { ticks: { maxTicksLimit: 7 } }, y: { beginAtZero: true } },
    },
  });

  // Line chart: tasks completed per week
  if (workWeeksChart) workWeeksChart.destroy();
  workWeeksChart = new Chart(byId('work-weeks-chart'), {
    type: 'line',
    data: {
      labels: s.weeks8.map((w) => w.label),
      datasets: [{
        data: s.weeks8.map((w) => w.done),
        borderColor: '#66d9ef',
        backgroundColor: 'rgba(102, 217, 239, 0.15)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Tasks done per week' },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderWorkLogs(logs) {
  const list = byId('worklog-list');
  list.innerHTML = '';

  logs.forEach((l) => {
    const li = document.createElement('li');

    const meta = document.createElement('span');
    meta.className = 'exp-meta';
    meta.textContent = l.description; // textContent is safe against XSS
    const date = document.createElement('small');
    date.textContent = ` ${l.date}`;
    meta.appendChild(date);

    const hours = document.createElement('span');
    hours.className = 'exp-amount';
    hours.textContent = fmtHours(l.minutes) + ' h';

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await api(`/api/work/logs/${l.id}`, 'DELETE');
      loadWork();
    });

    li.append(meta, hours, del);
    list.appendChild(li);
  });
}

// Which buttons each column's cards get: [label, new status]
const BOARD_MOVES = {
  todo: [['Start', 'doing']],
  doing: [['Back', 'todo'], ['Done', 'done']],
  done: [['Reopen', 'doing']],
};

function renderBoard(tasks) {
  const titles = { todo: 'To do', doing: 'Doing', done: 'Done' };

  ['todo', 'doing', 'done'].forEach((status) => {
    let items = tasks.filter((t) => t.status === status);
    if (status === 'done') {
      // newest finished first, show only the latest 15
      items.sort((a, b) => (b.done_date || '').localeCompare(a.done_date || ''));
      items = items.slice(0, 15);
    }

    const total = tasks.filter((t) => t.status === status).length;
    byId(`col-${status}-title`).textContent = `${titles[status]} (${total})`;

    const col = byId(`board-${status}`);
    col.innerHTML = '';

    items.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'task-card';

      const title = document.createElement('div');
      title.textContent = t.title;
      card.appendChild(title);

      const row = document.createElement('div');
      row.className = 'task-actions';

      BOARD_MOVES[status].forEach(([label, newStatus]) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.addEventListener('click', async () => {
          await api(`/api/work/tasks/${t.id}/move`, 'POST', { status: newStatus, date: today() });
          loadWork();
        });
        row.appendChild(btn);
      });

      const rm = document.createElement('button');
      rm.textContent = 'X';
      rm.className = 'secondary';
      rm.addEventListener('click', async () => {
        await api(`/api/work/tasks/${t.id}`, 'DELETE');
        loadWork();
      });
      row.appendChild(rm);

      card.appendChild(row);
      col.appendChild(card);
    });
  });
}

byId('worklog-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data } = await api('/api/work/logs', 'POST', {
    date: byId('wl-date').value,
    hours: byId('wl-hours').value,
    description: byId('wl-desc').value,
  });
  if (ok) {
    byId('worklog-error').textContent = '';
    byId('wl-hours').value = '';
    byId('wl-desc').value = '';
    loadWork();
  } else {
    byId('worklog-error').textContent = data.error;
  }
});

byId('worktask-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/work/tasks', 'POST', { title: byId('wt-title').value });
  byId('wt-title').value = '';
  loadWork();
});

// ===================================================
//  SELF GROWTH TAB
// ===================================================
async function loadGrowth() {
  if (!byId('jr-date').value) byId('jr-date').value = today();
  if (!byId('st-date').value) byId('st-date').value = today();

  const [summary, journal, study] = await Promise.all([
    api(`/api/growth/summary?date=${today()}`),
    api('/api/growth/journal'),
    api('/api/growth/study'),
  ]);

  if (summary.ok) {
    const s = summary.data;
    byId('growth-mood').textContent = s.avgMood7 === null ? '—' : s.avgMood7;
    byId('growth-study').textContent = fmtHours(s.studyWeekMinutes);
    byId('growth-entries').textContent = s.journalDays;
    renderGrowthCharts(s);
  }
  if (journal.ok) renderJournalList(journal.data);
  if (study.ok) renderStudyList(study.data);
}

function renderGrowthCharts(s) {
  // Dot graph: mood for each of the last 30 days (no line, only dots)
  if (moodChart) moodChart.destroy();
  moodChart = new Chart(byId('mood-chart'), {
    type: 'line',
    data: {
      labels: s.mood30.map((d) => d.date.slice(5)),
      datasets: [{
        data: s.mood30.map((d) => d.mood),
        showLine: false,
        pointRadius: 6,
        pointBackgroundColor: '#a6e22e',
        borderColor: '#a6e22e',
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Mood (last 30 days)' },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { min: 1, max: 5, ticks: { stepSize: 1 } },
      },
    },
  });

  // Pie chart: study time per skill, last 30 days
  const hasData = s.bySkill.length > 0;
  if (studyPieChart) studyPieChart.destroy();
  studyPieChart = new Chart(byId('study-pie-chart'), {
    type: 'pie',
    data: {
      labels: hasData ? s.bySkill.map((x) => x.skill) : ['No study yet'],
      datasets: [{
        data: hasData ? s.bySkill.map((x) => Math.round((x.minutes / 60) * 100) / 100) : [1],
        backgroundColor: hasData
          ? s.bySkill.map((x, i) => STUDY_COLORS[i % STUDY_COLORS.length])
          : ['#2a3524'],
        borderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { title: { display: true, text: 'Study hours by skill (30 days)' } },
    },
  });
}

function renderJournalList(entries) {
  const list = byId('journal-list');
  list.innerHTML = '';

  entries.forEach((e) => {
    const li = document.createElement('li');

    const meta = document.createElement('span');
    meta.className = 'exp-meta';
    meta.textContent = e.note ? `${MOOD_LABELS[e.mood]}: ${e.note}` : MOOD_LABELS[e.mood];
    const date = document.createElement('small');
    date.textContent = ` ${e.date}`;
    meta.appendChild(date);

    const mood = document.createElement('span');
    mood.className = 'exp-amount';
    mood.textContent = `${e.mood}/5`;

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await api(`/api/growth/journal/${e.id}`, 'DELETE');
      loadGrowth();
    });

    li.append(meta, mood, del);
    list.appendChild(li);
  });
}

function renderStudyList(entries) {
  const list = byId('study-list');
  list.innerHTML = '';

  entries.forEach((e) => {
    const li = document.createElement('li');

    const meta = document.createElement('span');
    meta.className = 'exp-meta';
    meta.textContent = e.skill;
    const date = document.createElement('small');
    date.textContent = ` ${e.date}`;
    meta.appendChild(date);

    const hours = document.createElement('span');
    hours.className = 'exp-amount';
    hours.textContent = fmtHours(e.minutes) + ' h';

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await api(`/api/growth/study/${e.id}`, 'DELETE');
      loadGrowth();
    });

    li.append(meta, hours, del);
    list.appendChild(li);
  });
}

byId('journal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data } = await api('/api/growth/journal', 'PUT', {
    date: byId('jr-date').value,
    mood: byId('jr-mood').value,
    note: byId('jr-note').value,
  });
  if (ok) {
    byId('journal-error').textContent = '';
    byId('jr-note').value = '';
    loadGrowth();
  } else {
    byId('journal-error').textContent = data.error;
  }
});

byId('study-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data } = await api('/api/growth/study', 'POST', {
    skill: byId('st-skill').value,
    hours: byId('st-hours').value,
    date: byId('st-date').value,
  });
  if (ok) {
    byId('study-error').textContent = '';
    byId('st-skill').value = '';
    byId('st-hours').value = '';
    loadGrowth();
  } else {
    byId('study-error').textContent = data.error;
  }
});