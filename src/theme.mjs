// This script is embedded in the document head so a saved choice applies before paint.
export const themeScript = `
(() => {
  const key = 'zxcxblog-theme';
  let theme = 'light';
  try { if (localStorage.getItem(key) === 'dark') theme = 'dark'; } catch {}
  const apply = () => {
    document.documentElement.dataset.theme = theme;
    const button = document.querySelector('.theme-toggle');
    if (button) button.setAttribute('aria-pressed', String(theme === 'dark'));
  };
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('.theme-toggle');
    if (!button) return;
    apply();
    const toggle = () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      apply();
      try { localStorage.setItem(key, theme); } catch {}
    };
    button.addEventListener('click', toggle);
    document.addEventListener('keydown', event => {
      const target = event.target;
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat && event.key.toLowerCase() === 't' && !target?.isContentEditable && !['INPUT','TEXTAREA','SELECT'].includes(target?.tagName)) { event.preventDefault(); toggle(); }
    });
  });
})();`;
