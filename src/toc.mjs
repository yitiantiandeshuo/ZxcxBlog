// Keep both directory presentations in sync without collecting reading data.
export const tocScript = `
(() => {
  const links = Array.from(document.querySelectorAll('.post-toc-nav a'));
  const items = links.map(link => {
    try { return {link, heading: document.getElementById(decodeURIComponent(link.hash.slice(1)))}; }
    catch { return {link, heading: null}; }
  }).filter(item => item.heading);
  if (!items.length) return;
  let pending = false;
  function update() {
    pending = false;
    let current = items[0].heading;
    for (const item of items) {
      if (item.heading.getBoundingClientRect().top <= 100) current = item.heading;
    }
    for (const item of items) {
      if (item.heading === current) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    }
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', schedule, {passive:true});
  update();
})();`;
