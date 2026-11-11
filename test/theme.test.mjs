import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { themeScript } from '../src/theme.mjs';

function setup(initial, blocked = false) {
  const attrs = {};
  let click;
  let ready;
  let stored = initial;
  const button = { setAttribute: (key, value) => { attrs[key] = value; }, addEventListener: (_, fn) => { click = fn; } };
  const document = { documentElement: { dataset: {} }, querySelector: () => button, addEventListener: (_, fn) => { ready = fn; } };
  const localStorage = { getItem: () => { if (blocked) throw Error('blocked'); return stored; }, setItem: (_, value) => { if (blocked) throw Error('blocked'); stored = value; } };
  runInNewContext(themeScript, { document, localStorage });
  ready();
  return { document, attrs, click: () => click(), stored: () => stored };
}

test('theme remembers a choice and updates the accessible button', () => {
  const page = setup('dark');
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  assert.equal(page.attrs['aria-pressed'], 'true');
  page.click();
  assert.equal(page.document.documentElement.dataset.theme, 'light');
  assert.equal(page.attrs['aria-pressed'], 'false');
  assert.equal(page.stored(), 'light');
});

test('theme remains usable when browser storage is blocked', () => {
  const page = setup(null, true);
  assert.equal(page.document.documentElement.dataset.theme, 'light');
  page.click();
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  assert.equal(page.attrs['aria-pressed'], 'true');
});
