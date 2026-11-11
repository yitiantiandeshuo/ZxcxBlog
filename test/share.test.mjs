import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {shareScript} from '../src/share.mjs';

test('share falls back to a selectable clean URL when clipboard is unavailable',async()=>{
  let click, selected=false;
  const status={textContent:''}, fallback={hidden:true,value:'',select(){selected=true}}, button={addEventListener(_,fn){click=fn}};
  const document={title:'文章',querySelector(selector){return {'#shareArticle':button,'#shareStatus':status,'#shareFallback':fallback}[selector]}};
  runInNewContext(shareScript,{document,location:{origin:'https://blog.test',pathname:'/post/test'},navigator:{}});
  await click();assert.equal(fallback.value,'https://blog.test/post/test');assert.equal(fallback.hidden,false);assert.equal(selected,true);assert.equal(status.textContent,'请手动复制文章链接');
});

test('share sends the canonical article URL only after the reader clicks',async()=>{
  let click, shared;const status={textContent:''}, fallback={hidden:true}, button={addEventListener(_,fn){click=fn}};
  const document={title:'标题',querySelector(s){return {'#shareArticle':button,'#shareStatus':status,'#shareFallback':fallback}[s]}};
  runInNewContext(shareScript,{document,location:{origin:'https://blog.test',pathname:'/post/test'},navigator:{async share(value){shared=value}}});
  assert.equal(shared,undefined);await click();assert.equal(shared.url,'https://blog.test/post/test');assert.equal(shared.title,'标题');
});
