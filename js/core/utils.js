/* PokeNav — small string + label formatters used across panels */

function formatTime(t) {
  const map = { day: '☀ Day only', night: '🌙 Night only', morning: '🌅 Morning only', any: 'Any time' };
  return map[t] || 'Any time';
}

function formatWeather(w) {
  const map = { clear: '☀ Clear only', rain: '🌧 Rain only', thunder: '⛈ Thunder only', any: 'Any' };
  return map[w] || 'Any';
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeSingleQuote(str) {
  return str.replace(/'/g, "\\'");
}
