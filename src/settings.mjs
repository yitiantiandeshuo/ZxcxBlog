const mediaPattern = /^\/media\/[a-f0-9-]{36}\.(?:png|jpg|gif|webp)$/;
export async function readSettings(env) {
  try {
    const row = await env.DB.prepare('SELECT title, description, avatar_url, icon_url, home_heading, home_show_excerpt FROM site_settings WHERE id = 1').first();
    if (row && typeof row.title === 'string' && typeof row.description === 'string' && typeof row.avatar_url === 'string' && typeof row.icon_url === 'string') return row;
  } catch { /* Allow a safe fallback while an older database is being migrated. */ }
  return null;
}
export async function settingsEnv(env) {
  const row = await readSettings(env);
  return row ? {...env, SITE_TITLE:row.title, SITE_DESCRIPTION:row.description, SITE_AVATAR_URL:row.avatar_url, SITE_ICON_URL:row.icon_url, HOME_HEADING:row.home_heading, HOME_SHOW_EXCERPT:row.home_show_excerpt} : env;
}
export function settingsValues(env, row) {
  return {title:row?.title ?? env.SITE_TITLE ?? '我的博客', description:row?.description ?? env.SITE_DESCRIPTION ?? '记录生活与思考。', avatar_url:row?.avatar_url ?? env.SITE_AVATAR_URL ?? '', icon_url:row?.icon_url ?? env.SITE_ICON_URL ?? '', home_heading:row?.home_heading ?? '近期发布', home_show_excerpt:row ? row.home_show_excerpt === 1 : true};
}
function validImage(value) {
  if (!value || mediaPattern.test(value)) return true;
  try { const url = new URL(value); return value.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export async function saveSettings(env, input) {
  if (!input || typeof input.title !== 'string' || typeof input.description !== 'string' || typeof input.avatar_url !== 'string' || typeof input.icon_url !== 'string') throw new Error('请检查站点设置');
  const current = await readSettings(env);
  const title=input.title.trim(), description=input.description.trim(), avatar=input.avatar_url.trim(), icon=input.icon_url.trim();
  const heading = input.home_heading === undefined ? (current?.home_heading ?? '近期发布') : typeof input.home_heading === 'string' ? input.home_heading.trim() : '';
  const showExcerpt = input.home_show_excerpt === undefined ? (current?.home_show_excerpt ?? 1) : input.home_show_excerpt === true ? 1 : input.home_show_excerpt === false ? 0 : -1;
  if (!title || title.length > 80 || description.length > 500 || !heading || heading.length > 80 || showExcerpt < 0 || [avatar,icon].some(value => !validImage(value))) throw new Error('请检查站点名称、简介和图片');
  for (const url of new Set([avatar,icon].filter(value => mediaPattern.test(value)))) {
    if (!await env.BUCKET.head(url.slice('/media/'.length))) throw new Error('请检查站点图片是否存在');
  }
  await env.DB.prepare('INSERT INTO site_settings (id,title,description,avatar_url,icon_url,home_heading,home_show_excerpt) VALUES (1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,avatar_url=excluded.avatar_url,icon_url=excluded.icon_url,home_heading=excluded.home_heading,home_show_excerpt=excluded.home_show_excerpt').bind(title,description,avatar,icon,heading,showExcerpt).run();
  return {title,description,avatar_url:avatar,icon_url:icon,home_heading:heading,home_show_excerpt:showExcerpt === 1};
}
export function settingsPage() { return `<h1>站点设置</h1><p>设置网站名称、简介、头像和浏览器标签图标。保存后图片会公开显示。</p><p><a href="/admin">← 返回文章管理</a></p><form id="siteSettings" class="panel"><label class="field"><span>网站名称</span><input name="title" required maxlength="80"></label><label class="field"><span>网站简介</span><textarea name="description" maxlength="500"></textarea></label><label class="field"><span>首页文章列表标题</span><input name="home_heading" required maxlength="80"></label><label class="settings-checkbox"><input name="home_show_excerpt" type="checkbox">在首页显示文章摘要</label><div class="field"><span>网站头像</span><img id="avatarPreview" class="settings-image" alt="当前头像" hidden><input type="hidden" name="avatar_url"><input type="file" id="avatarFile" accept="image/png,image/jpeg,image/gif,image/webp"><button type="button" class="secondary" data-upload="avatar">上传头像</button> <button type="button" class="secondary" data-clear="avatar">移除头像</button></div><div class="field"><span>站点图标</span><img id="iconPreview" class="settings-image" alt="当前图标" hidden><input type="hidden" name="icon_url"><input type="file" id="iconFile" accept="image/png,image/jpeg,image/gif,image/webp"><button type="button" class="secondary" data-upload="icon">上传图标</button> <button type="button" class="secondary" data-clear="icon">移除图标</button></div><p class="muted">支持 PNG、JPEG、GIF、WebP，单张不超过 5 MB；上传后点击保存才能生效。更换图片不会删除旧文件。</p><button type="submit">保存设置</button><p id="settingsNotice" role="status"></p></form><script>
const form=document.querySelector('#siteSettings'), notice=document.querySelector('#settingsNotice');
async function api(path,options={}){const response=await fetch(path,options);const data=await response.json();if(!response.ok)throw Error(data.error||'操作失败');return data;}
function preview(kind,url){const image=document.querySelector('#'+kind+'Preview');image.hidden=!url;if(url) image.src=url.startsWith('/media/')?'/api/admin/media/'+url.slice(7):url;else image.removeAttribute('src');}
async function load(){const data=await api('/api/admin/settings');for(const key of ['title','description','avatar_url','icon_url','home_heading'])form.elements[key].value=data[key];form.elements.home_show_excerpt.checked=data.home_show_excerpt;preview('avatar',data.avatar_url);preview('icon',data.icon_url);}
for(const kind of ['avatar','icon']){document.querySelector('[data-upload="'+kind+'"]').onclick=async()=>{try{const file=document.querySelector('#'+kind+'File').files[0];if(!file)throw Error('请先选择图片');const body=new FormData();body.append('file',file);notice.textContent='正在上传…';const data=await api('/api/admin/images',{method:'POST',body});form.elements[kind+'_url'].value=data.url;preview(kind,data.url);notice.textContent='图片已上传，点击保存设置后生效。';}catch(error){notice.textContent=error.message;}};document.querySelector('[data-clear="'+kind+'"]').onclick=()=>{form.elements[kind+'_url'].value='';preview(kind,'');notice.textContent='点击保存设置后生效。';};}
form.onsubmit=async event=>{event.preventDefault();try{const data=Object.fromEntries(new FormData(form));data.home_show_excerpt=form.elements.home_show_excerpt.checked;await api('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});notice.textContent='设置已保存。';}catch(error){notice.textContent=error.message;}};
load().catch(error=>{notice.textContent=error.message});
</script>`; }
