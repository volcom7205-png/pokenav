/* PokeNav — Most Wanted list. Owned by Trainer's PC, also read by the
   Pokédex card so the "+ Wanted" button reflects state immediately. */

const WantedList = (() => {
  const LS_KEY = 'pokenav_wanted_list';

  let ids = new Set();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) ids = new Set(JSON.parse(raw));
    } catch (e) { /* corrupt — ignore */ }
  }

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  }

  function isWanted(id) { return ids.has(id); }

  function toggleWanted(id) {
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    save();
    listeners.forEach(cb => { try { cb(); } catch (e) { console.error(e); } });
  }

  function getAll() { return new Set(ids); }

  function onChanged(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  load();

  return { isWanted, toggleWanted, getAll, onChanged };
})();
