export const css = `
:root{color-scheme:light;--bg:#fff;--ink:#393939;--muted:#777;--accent:#2d9b72;--line:#e7e7e7}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}a{color:inherit;text-decoration:none;border-bottom:1px solid #bbb}a:hover{color:var(--accent);border-color:var(--accent)}.wrap{max-width:760px;padding:0 28px;margin:auto}header{padding:64px 0 48px;display:flex;gap:32px;justify-content:space-between;align-items:baseline}header a,.nav a,.logo{border:0}.logo{font-weight:700;font-size:20px;letter-spacing:.02em}.nav{display:flex;gap:20px;flex-wrap:wrap;font-size:14px}.nav a{color:#666}main{min-height:52vh}h1,h2,h3{line-height:1.45;color:#242424}h1{font-size:25px;margin:0 0 10px}h2{font-size:19px;margin:42px 0 20px}h3{font-size:16px}p{margin:1em 0}.intro{margin:0 0 48px}.intro p{white-space:pre-line}.muted,.meta,time{color:var(--muted);font-size:13px}.accent{color:var(--accent)}.post-list{list-style:none;padding:0;margin:0}.post-list li{display:flex;gap:26px;padding:6px 0;align-items:baseline}.post-list time{flex:none;min-width:92px}.post-list a{border:0}.post-list a:hover{border-bottom:1px solid}.content{overflow-wrap:anywhere}.content img{max-width:100%;height:auto}.content pre{overflow:auto;background:#f6f7f7;padding:16px;border-radius:4px;line-height:1.6}.content code{font-family:ui-monospace,monospace;font-size:.9em}.content blockquote{margin-left:0;padding-left:18px;border-left:3px solid var(--accent);color:#777}.content a{color:var(--accent)}.chips{display:flex;gap:10px;flex-wrap:wrap}.chips a{font-size:13px;color:var(--accent)}footer{margin:80px 0 32px;padding-top:20px;border-top:1px solid var(--line);font-size:12px;color:#888;display:flex;justify-content:space-between;gap:10px}footer a{border:0}input,textarea,select,button{font:inherit}input,textarea,select{border:1px solid #d4d4d4;border-radius:4px;padding:9px;width:100%;background:#fff;color:#333}input[type=file]{padding:6px}textarea{resize:vertical;min-height:120px}button,.button{cursor:pointer;background:#258c69;color:white;border:0;border-radius:4px;padding:8px 14px}button.secondary,.button.secondary{background:#eee;color:#333}button.danger{background:#a54f4f}.field{display:block;margin:14px 0}.field>span{display:block;font-size:13px;font-weight:600;margin-bottom:4px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.row>*{flex:1}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.editor{min-height:330px;font-family:ui-monospace,monospace;font-size:13px}.panel{border:1px solid var(--line);padding:16px;border-radius:4px;margin:14px 0}.notice{color:#9b4b3e;white-space:pre-wrap}.results{margin-top:25px}.status{font-size:12px;color:#888}.sr{position:absolute;left:-9999px}@media(max-width:600px){header{padding:34px 0;display:block}.nav{margin-top:14px;gap:16px}.post-list li{gap:10px}.post-list time{min-width:82px;font-size:12px}footer{display:block}}
/* Homepage and shared navigation adapted from Higan Haozi; see licenses/higan-haozi-MIT.txt. */
:root{--accent:#2bbc8a}
body{line-height:1.725;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
.wrap{max-width:48rem;padding:0 2rem}
header{display:block;padding:4rem 0 0;margin:0 auto 3rem}
.logo{display:inline-block;font-size:1.5rem;line-height:2rem;letter-spacing:.01em;color:var(--ink)}
.nav{gap:0;margin-top:.5rem;font-size:.875rem;line-height:1.1}
.nav a{color:var(--accent);padding:0 .9375rem;border-right:1px dotted var(--accent)}
.nav a:first-child{padding-left:0}.nav a:last-child{border-right:0}
.nav a:hover{color:var(--accent);text-decoration:underline;text-underline-offset:.3em}
.mobile-menu{display:none}
.intro{margin:0 0 3rem}.intro p{margin:0 0 1rem}
.home-posts-title{font-size:1.35rem;letter-spacing:.01em;margin:3rem 0 1rem;color:var(--accent)}
.home-posts-title a{border:0;color:inherit}
.archive-year h2{font-size:1.35rem;letter-spacing:.01em;margin:2.5rem 0 1rem}
.post-list{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.3125rem 1rem}
.post-list li{display:contents}.post-list time{min-width:0;font-size:.875rem;color:#777}.post-list a{min-width:0;overflow-wrap:anywhere}
@media(max-width:639px){.wrap{padding:0 1rem}header{padding-top:3rem;margin-bottom:2rem}.nav{gap:.6rem 0;line-height:1.5}.nav a{padding:0 .65rem}.post-list{display:block}.post-list li{display:block;margin:0 0 1rem;padding:0}.post-list time{display:block}}
@media(max-width:639px){header{position:relative}.logo{max-width:calc(100% - 3.5rem)}.nav-desktop{display:none}.mobile-menu{display:block}.mobile-menu summary{position:absolute;top:2.65rem;right:0;display:flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;list-style:none;cursor:pointer;color:var(--accent);font-size:1.35rem}.mobile-menu summary::-webkit-details-marker{display:none}.mobile-menu summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.nav.nav-mobile{display:flex;flex-direction:column;align-items:flex-start;gap:.6rem;margin-top:1rem;font-size:1rem}.nav.nav-mobile a{border:0;padding:0}}
/* Article typography adapted from Higan Haozi; see licenses/higan-haozi-MIT.txt. */
.post-heading{margin-bottom:2rem}
.post-heading h1{font-size:1.5em;line-height:1.3;letter-spacing:.01em;overflow-wrap:anywhere;margin:0 0 .5rem}
.post-heading .meta{margin:0 0 .65rem;color:#777;font-size:.875rem}
.post-heading .chips{gap:.5rem 1rem}
.post-content{line-height:1.725;overflow-wrap:break-word}
.post-content p{margin:1rem 0;hyphens:auto}
.post-content h1,.post-content h2,.post-content h3,.post-content h4,.post-content h5,.post-content h6{line-height:1.4;overflow-wrap:anywhere}
.post-content h1{font-size:1.5em;color:var(--accent);margin:3rem 0 1rem}
.post-content h2{font-size:1.25em;margin:2rem 0 .5rem}
.post-content h3{font-size:1.1em;margin:1.5rem 0 .5rem}
.post-content h4,.post-content h5,.post-content h6{font-size:1em;margin:1rem 0 .5rem}
.post-content a{text-decoration:underline;text-underline-offset:.2em;border:0}
.post-content blockquote{margin:1.5rem 0;padding:.1rem 1rem;border-left:3px solid var(--accent);color:#777}
.post-content :not(pre)>code{border:1px dotted #999;border-radius:.125rem;padding:0 .3125rem;overflow-wrap:anywhere}
.post-content pre{margin:1.5rem 0;padding:1rem;line-height:1.5;overflow-x:auto;border-radius:.125rem}
.post-content pre code{display:block;border:0;padding:0;white-space:pre;overflow-wrap:normal}
.post-content img{display:block;max-width:100%;height:auto;margin:1.5rem auto}
.post-content ul,.post-content ol{padding-left:1.5rem}
@media(max-width:639px){.post-heading{margin-bottom:1.5rem}.post-content pre{margin-left:-.5rem;margin-right:-.5rem}}

`;
