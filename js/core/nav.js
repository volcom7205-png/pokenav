/* PokeNav — top-tab navigation with back stack, gear button, ESC, badges */

const tabHistory = [];
let currentPanel = 'pokedex';

function switchPanel(panelName, isBack) {
  if (!panelName || panelName === currentPanel) return;
  if (!isBack) tabHistory.push(currentPanel);

  document.querySelectorAll('.nav-tab[data-panel]').forEach(t => {
    t.classList.toggle('active', t.dataset.panel === panelName);
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + panelName);
  });
  document.getElementById('settings-gear-btn')?.classList.toggle('active', panelName === 'settings');

  currentPanel = panelName;
  updateBackBtn();

  if (panelName === 'settings') buildSettingsPanel();
}

function updateBackBtn() {
  const btn = document.getElementById('back-btn');
  if (!btn) return;
  btn.style.display = tabHistory.length > 0 ? 'inline-block' : 'none';
}

function updateTabBadges() {
  const partyBadge = document.getElementById('tab-badge-party');
  const partyCount = document.getElementById('pc-mode-count-party');
  const wantedCount = document.getElementById('pc-mode-count-wanted');

  let owned = 0;
  if (typeof PartyStorage !== 'undefined' && PartyStorage.getOwnedDexIds) {
    // getOwnedDexIds returns unique dex IDs; for badge we want raw filled-slot count
    const all = PartyStorage.getAllOwned ? PartyStorage.getAllOwned() : [];
    owned = all.length;
  }
  let wanted = 0;
  if (typeof WantedList !== 'undefined') {
    wanted = WantedList.getAll().size;
  }

  if (partyBadge) {
    partyBadge.textContent = owned ? owned : '';
    partyBadge.classList.toggle('hidden', !owned);
  }
  if (partyCount) {
    partyCount.textContent = owned ? owned : '';
    partyCount.classList.toggle('hidden', !owned);
  }
  if (wantedCount) {
    wantedCount.textContent = wanted ? wanted : '';
    wantedCount.classList.toggle('hidden', !wanted);
  }
}

function dismissTopOverlay() {
  // Dismiss whichever modal-style overlay is on top, in priority order.
  // Trainer-name modal is intentionally NOT dismissable via ESC — it's
  // an onboarding gate.
  const reset = document.getElementById('reset-modal');
  if (reset && !reset.classList.contains('hidden')) {
    reset.classList.add('hidden');
    return true;
  }
  const card = document.getElementById('pokedex-card-overlay');
  if (card && !card.classList.contains('hidden')) {
    card.classList.add('hidden');
    return true;
  }
  return false;
}

function initNav() {
  document.querySelectorAll('.nav-tab[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      switchPanel(item.dataset.panel, false);
    });
  });

  document.getElementById('back-btn')?.addEventListener('click', () => {
    if (!tabHistory.length) return;
    const prev = tabHistory.pop();
    switchPanel(prev, true);
  });

  document.getElementById('settings-gear-btn')?.addEventListener('click', () => {
    switchPanel('settings', false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismissTopOverlay();
  });

  if (typeof WantedList !== 'undefined') {
    WantedList.onChanged(updateTabBadges);
  }
  updateTabBadges();
}
