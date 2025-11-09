document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const nav   = document.querySelector('#cs-navigation');
  const toggle = document.querySelector('#cs-navigation .cs-toggle');
  const csUL  = document.querySelector('#cs-expanded');

  // Mobile toggle
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('cs-active');
      nav.classList.toggle('cs-active');
      body.classList.toggle('cs-open');
      if (csUL) csUL.setAttribute('aria-expanded', csUL.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
  }

  // Scroll state
  const updateScroll = () => body.classList.toggle('scroll', window.scrollY >= 100);
  updateScroll();
  window.addEventListener('scroll', updateScroll, { passive: true });

  // Mobile dropdowns
  document.querySelectorAll('#cs-navigation .cs-dropdown').forEach(item => {
    item.addEventListener('click', () => item.classList.toggle('cs-active'));
  });
});