// Sets a progress ring (0 to 100)
function setRing(id, percent) {
  const ring = document.getElementById(id);
  if (!ring) return;
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  ring.style.setProperty('--p', value);
  ring.querySelector('.ring-value').textContent = value + '%';
}

// A different quote each day
const QUOTES = [
  'Small steps, repeated daily, build the life you want.',
  'Do the work, especially on the days you do not feel like it.',
  'Consistency beats intensity.',
  'Show up today. Future you is watching.',
  'Progress, not perfection.',
  'What you repeat, you become.',
  'Be the person your goals need.',
];

(function showQuoteAndDate() {
  const quote = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
  document.getElementById('hero-quote').textContent = quote;
  document.getElementById('side-quote').textContent = quote;
  document.getElementById('hero-date').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
})();

// Chart look: softer grid lines and the same font as the page
Chart.defaults.borderColor = 'rgba(166, 226, 46, 0.08)';
Chart.defaults.font.family = 'Inter, Arial, sans-serif';