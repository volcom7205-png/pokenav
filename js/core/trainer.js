/* PokeNav — trainer name persistence + entry modal */

const TRAINER_KEY = 'pokenav_trainer';

function getTrainerName() {
  return localStorage.getItem(TRAINER_KEY) || '';
}

function setTrainerName(name) {
  localStorage.setItem(TRAINER_KEY, name);
  applyTrainerName();
}

function applyTrainerName() {
  const name = getTrainerName();
  const display = document.getElementById('trainer-display');
  if (display) display.textContent = name ? name.toUpperCase() : 'TRAINER';

  const pcTab = document.querySelector('.nav-tab[data-panel="party"]');
  if (pcTab) {
    const badge = pcTab.querySelector('.tab-badge');
    pcTab.textContent = name ? `${name}'s PC` : "Trainer's PC";
    if (badge) pcTab.appendChild(badge);
  }
}

function initTrainer() {
  applyTrainerName();
  if (!getTrainerName()) {
    showTrainerModal();
  }
}

function showTrainerModal() {
  const modal = document.getElementById('trainer-modal');
  const input = document.getElementById('trainer-modal-input');
  const btn   = document.getElementById('trainer-modal-confirm');
  if (!modal || !input || !btn) return;

  modal.classList.remove('hidden');
  input.value = getTrainerName();
  setTimeout(() => input.focus(), 50);

  const submit = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    setTrainerName(v);
    modal.classList.add('hidden');
  };

  btn.onclick = submit;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };
}
