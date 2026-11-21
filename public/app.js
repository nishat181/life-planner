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

init();