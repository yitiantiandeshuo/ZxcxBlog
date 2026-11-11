// Invoked only by a reader; no sharing service receives data automatically.
export const shareScript = `
(() => {
  const button=document.querySelector('#shareArticle'), status=document.querySelector('#shareStatus'), fallback=document.querySelector('#shareFallback');
  if(!button || !status || !fallback) return;
  button.addEventListener('click', async () => {
    const url=location.origin+location.pathname;
    try {
      if(navigator.share) { await navigator.share({title:document.title,url}); status.textContent=''; return; }
      if(navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); status.textContent='链接已复制'; return; }
    } catch(error) { if(error.name==='AbortError') return; }
    fallback.hidden=false; fallback.value=url; fallback.select(); status.textContent='请手动复制文章链接';
  });
})();`;
