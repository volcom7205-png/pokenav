/* PokeNav — small string + label formatters used across panels */

function formatTime(t) {
  const map = {
    day: '☀ Day only',
    night: '🌙 Night only',
    morning: '🌅 Morning only',
    dusk: '🌆 Dusk only',
    any: 'Any time',
  };
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

// Cobbledex 3D model preview URL with PokeAPI sprite as fallback.
// Use the returned object's onerror string as an inline `onerror=...` attr
// so a single broken image swaps to the fallback without JS scaffolding.
const SPRITE_CDN = 'https://cobbledex.b-cdn.net/3dmons/previews';
const SPRITE_FALLBACK = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

function spriteUrl(id, size = 'small') {
  return `${SPRITE_CDN}/${size}/${id}.webp`;
}

function spriteFallbackOnError(id) {
  return `this.onerror=null;this.src='${SPRITE_FALLBACK}/${id}.png'`;
}
