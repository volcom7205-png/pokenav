// =====================
// PANEL NAVIGATION
// =====================

// Grab all nav items and all panels
const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');

// When a nav item is clicked...
navItems.forEach(item => {
  item.addEventListener('click', () => {

    // Remove 'active' from all nav items and panels
    navItems.forEach(i => i.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    // Add 'active' to the clicked nav item
    item.classList.add('active');

    // Find the matching panel and make it active
    const targetPanel = document.getElementById('panel-' + item.dataset.panel);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

  });
});