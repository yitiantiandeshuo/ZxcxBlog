// Shared with the browser as source so scheduling and stale-response handling are testable.
export const previewControllerSource = `function createPreviewController({read, request, render, report, delay = 1200, setTimer = setTimeout, clearTimer = clearTimeout}) {
  let sequence = 0, timer, enabled = false;
  function invalidate() { sequence++; if (timer !== undefined) clearTimer(timer); timer = undefined; }
  async function run() {
    invalidate();
    const current = sequence, content = read();
    try {
      const result = await request(content);
      if (current === sequence && content === read()) { render(result); report('预览已更新'); }
    } catch (error) {
      if (current === sequence) report(error.message || '预览失败');
    }
  }
  function changed() {
    invalidate();
    if (enabled) { report('等待更新预览…'); timer = setTimer(run, delay); }
    else report('正文已变更，点击预览。');
  }
  function setEnabled(value) {
    enabled = Boolean(value); invalidate();
    if (enabled) run(); else report('自动预览已关闭');
  }
  return {run, changed, invalidate, setEnabled};
}`;
