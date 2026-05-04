/* PokeNav — Settings panel: trainer name editor + reset confirmation */

function buildSettingsPanel() {
  const panel = document.getElementById('panel-settings');
  if (!panel) return;

  const name = getTrainerName();

  panel.innerHTML = `
    <h2 class="settings-heading">TRAINER SETTINGS</h2>

    <div class="settings-trainer-display" id="settings-current-name"></div>

    <div class="settings-card">
      <label class="settings-label" for="settings-trainer-input">Edit Trainer Name</label>
      <div class="settings-row settings-row--input">
        <input id="settings-trainer-input" type="text" maxlength="20"
               placeholder="Trainer name..." autocomplete="off" />
        <button id="settings-save-btn" class="settings-btn settings-btn--primary" type="button">SAVE</button>
      </div>
    </div>

    <div class="settings-divider"></div>

    <div class="settings-card settings-card--danger">
      <div class="settings-label settings-label--danger">Danger Zone</div>
      <p class="settings-help">Wipes trainer name, party, storage, and all saved data, then reloads the app.</p>
      <button id="settings-reset-btn" class="settings-btn settings-btn--danger" type="button">RESET ALL DATA</button>
    </div>
  `;

  // Seed values via textContent/value to avoid HTML injection in user input
  document.getElementById('settings-current-name').textContent = name ? name.toUpperCase() : '—';
  document.getElementById('settings-trainer-input').value = name;

  document.getElementById('settings-save-btn').addEventListener('click', () => {
    const input = document.getElementById('settings-trainer-input');
    const v = (input.value || '').trim();
    if (!v) { input.focus(); return; }
    setTrainerName(v); // updates localStorage + nav display + PC tab label
    document.getElementById('settings-current-name').textContent = v.toUpperCase();
    flashSettingsSaved();
  });

  document.getElementById('settings-trainer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('settings-save-btn').click();
    }
  });

  document.getElementById('settings-reset-btn').addEventListener('click', showResetModal);
}

function showResetModal() {
  const modal = document.getElementById('reset-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const cancel = document.getElementById('reset-modal-cancel');
  const confirm = document.getElementById('reset-modal-confirm');
  const close = () => modal.classList.add('hidden');

  cancel.onclick = close;
  confirm.onclick = () => {
    localStorage.clear();
    location.reload();
  };

  // Close on backdrop click
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

function flashSettingsSaved() {
  const btn = document.getElementById('settings-save-btn');
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = 'SAVED';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = prev;
    btn.disabled = false;
  }, 900);
}
