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
    button.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      apply();
      try { localStorage.setItem(key, theme); } catch {}
    });
  });
})();`;
