/* PokeNav — top-tab navigation with back stack */

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

  currentPanel = panelName;
  updateBackBtn();

  if (panelName === 'settings') buildSettingsPanel();
}

function updateBackBtn() {
  const btn = document.getElementById('back-btn');
  if (!btn) return;
  btn.style.display = tabHistory.length > 0 ? 'inline-block' : 'none';
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
}
