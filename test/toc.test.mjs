import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {tocScript} from '../src/toc.mjs';

test('directory highlights the current heading in both menus as the reader scrolls', () => {
  const positions = {'中文': 20, 'next': 300};
  const headings = Object.fromEntries(Object.keys(positions).map(id => [id, {getBoundingClientRect: () => ({top:positions[id]})}]));
  const links = ['#%E4%B8%AD%E6%96%87','#next','#%E4%B8%AD%E6%96%87','#next'].map(hash => ({
    hash, attrs:{}, setAttribute(key,value){this.attrs[key]=value}, removeAttribute(key){delete this.attrs[key]}
  }));
  const events = {};
  const document = {querySelectorAll:()=>links,getElementById:id=>headings[id]};
  runInNewContext(tocScript,{document,addEventListener:(name,fn)=>{events[name]=fn},requestAnimationFrame:fn=>fn()});
  assert.equal(links[0].attrs['aria-current'],'location');assert.equal(links[2].attrs['aria-current'],'location');
  positions.next=30;events.scroll();
  assert.equal(links[1].attrs['aria-current'],'location');assert.equal(links[3].attrs['aria-current'],'location');
  assert.equal(links[0].attrs['aria-current'],undefined);
});
