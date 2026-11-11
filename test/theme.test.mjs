import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { themeScript } from '../src/theme.mjs';

function setup(initial, blocked = false) {
  const attrs = {};
  let click;
  const events = {};
  let stored = initial;
  const button = { setAttribute: (key, value) => { attrs[key] = value; }, addEventListener: (_, fn) => { click = fn; } };
  const document = { documentElement: { dataset: {} }, querySelector: () => button, addEventListener: (name, fn) => { events[name] = fn; } };
  const localStorage = { getItem: () => { if (blocked) throw Error('blocked'); return stored; }, setItem: (_, value) => { if (blocked) throw Error('blocked'); stored = value; } };
  runInNewContext(themeScript, { document, localStorage });
  events.DOMContentLoaded();
  return { document, attrs, click: () => click(), key: event => events.keydown(event), stored: () => stored };
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


test('theme shortcut works without interfering with text editing', () => {
  const page = setup(null);
  let prevented = false;
  page.key({altKey:true,key:'t',target:{tagName:'BODY'},preventDefault(){prevented=true}});
  assert.equal(page.document.documentElement.dataset.theme,'dark');assert.equal(prevented,true);
  page.key({altKey:true,key:'t',target:{tagName:'TEXTAREA'},preventDefault(){throw Error('editing shortcut intercepted')}});
  assert.equal(page.document.documentElement.dataset.theme,'dark');
});
