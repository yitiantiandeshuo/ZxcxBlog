# ZxcxBlog

一个运行在自己 Cloudflare 账户里的轻量个人博客。公开站点专注阅读，受保护的后台提供 Markdown 写作、图片上传和站点设置；不需要维护独立服务器或部署 Halo。

公开页面示例：[查看博客](https://yitian.de/)（实际内容和显示设置可能变化）。

布局和部分样式参考并改编自 [Higan Haozi](https://howiehz.top/halo-theme-higan-haozi/)。这个项目是独立实现，并不包含 Halo CMS，也不要求安装 Halo。

## 功能

- 阅读：响应式首页和文章页、深色模式、目录、上一篇和下一篇、归档、分类、标签和站内搜索。
- 写作：Markdown 编辑与预览、草稿与发布、图片上传、格式工具栏，以及可选的浏览器标签页内未保存内容恢复。
- 自定义：后台修改站名、简介、头像、站点图标、关于页、强调色、社交链接及部分显示选项。
- 自托管：Cloudflare Workers 运行应用，D1 保存文章和设置，R2 保存图片；Cloudflare Access 保护后台。
- 备份：导出文章及设置的 JSON；图片需要另外备份。

目前面向个人博客：没有评论、定时发布、版本历史和完整的多用户 CMS。搜索会读取已发布文章进行匹配，适合文章数量较少的站点。

## 部署前准备

首次部署需要一定命令行和 Cloudflare 操作经验。你需要：

1. 自己的 Cloudflare 账户，并有权管理 Workers、D1、R2 和 Zero Trust。先在 Cloudflare 控制台启用 R2；若要求提供付款方式或接受条款，请先阅读并自行决定。
2. Node.js 及 npm。建议使用受当前 Wrangler 支持的 Node.js LTS 版本；项目测试使用 Node.js 24。Wrangler 随项目依赖安装，无需全局安装。[Wrangler 环境要求](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
3. Git，或者从 GitHub 下载仓库 ZIP 并解压。完成部署后，日常写作和站点设置可在浏览器中进行。

> **费用提示：**可从 Cloudflare 免费额度开始，但 R2、D1 和 Workers 各自有计量及限制；免费额度不是整个账户的消费上限。用量、计费方式和可能要求的付款资料以 Cloudflare 当前页面为准。上线后请定期检查使用量和账单。[Workers 限额](https://developers.cloudflare.com/workers/platform/limits/) · [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/) · [R2 定价](https://developers.cloudflare.com/r2/pricing/)

## 首次部署

以下步骤以 macOS / Linux 终端为例。Windows 用户可在 PowerShell 中使用相同的 `npm` / `npx` 命令。所有命令均在项目目录运行；`npx --no-install` 使用已安装的项目内 Wrangler，不会为每一步安装新工具。

### 1. 获取代码并安装依赖

```sh
git clone https://github.com/yitiantiandeshuo/ZxcxBlog.git
cd ZxcxBlog
npm ci
npm test
npx --no-install wrangler login
npx --no-install wrangler whoami
```

按浏览器提示登录并授权，检查 `whoami` 返回的是预期账户。多个账户时，确认后续创建和部署使用正确账户。不要共享终端授权信息。`npm ci` 会按锁文件安装项目运行和开发依赖。

### 2. 创建数据库和图片桶

选择属于你自己的资源名称；以下只是示例。命令会在 Cloudflare 账户创建资源，可能产生用量。

```sh
npx --no-install wrangler d1 create my-blog-db
npx --no-install wrangler r2 bucket create my-blog-images
```

记录 D1 创建结果中的 `database_id`。如果资源名称已被占用或与现有资源冲突，请选择新名称；不要为了部署删除已有资源。R2 桶默认保持私有，不要开启 `r2.dev` 或设置公开自定义域名。图片通过 Worker 的 R2 binding 访问。

### 3. 配置自己的 Worker

复制不含账户资源的模板，再编辑 `wrangler.local.toml`：

```sh
cp wrangler.example.toml wrangler.local.toml
```

Windows PowerShell 可用 `Copy-Item wrangler.example.toml wrangler.local.toml`。个人配置已列入 `.gitignore`；后续部署命令都需要 `--config wrangler.local.toml`。至少修改以下值：

```toml
name = "my-blog" # 自己的 Worker 名称；不要与已有 Worker 重名

[[d1_databases]]
binding = "DB" # 保持不变
database_name = "my-blog-db"
database_id = "填写上一步创建的 D1 ID"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "BUCKET" # 保持不变
bucket_name = "my-blog-images"
```

**必须将模板中的 `database_id` 替换为自己的 D1 ID。**仓库不附带默认部署配置；必须使用个人配置文件。上面的片段只展示需要核对的字段，保留文件中的其他配置。`workers_dev = true` 用于初始访问，`preview_urls = false` 禁用额外预览 URL。`SITE_TITLE` 和 `SITE_DESCRIPTION` 可先修改，之后可以在后台“站点设置”调整；已经保存的后台设置会覆盖这两个默认值。

如果将自己的配置推送到公开仓库，请检查不包含密码、令牌、Access 邮箱或其他不希望公开的信息。数据库 ID、资源名称和账户环境也应按个人情况处理。

### 4. 初始化并首次部署

以下 `DB` 是配置里的 binding 名称。**确认它指向刚创建的空数据库**，不要对不确定的现有生产库应用迁移。

```sh
npx --no-install wrangler d1 migrations apply DB --remote --config wrangler.local.toml
npx --no-install wrangler deploy --config wrangler.local.toml
```

按提示确认迁移。部署会将 Worker 发布到 Cloudflare；记录 Wrangler 输出的 `https://<worker>.<子域名>.workers.dev` 地址。首次设置 `workers.dev` 子域名时，按 Cloudflare 控制台或 Wrangler 提示完成。

此时管理端缺少认证配置，会在服务端拒绝访问；公开页面可访问。接下来立即配置 Access 和身份验证，并完成匿名访问检查后再对外分享地址。

### 5. 保护管理页面与 API

在 Cloudflare 控制台启用 Zero Trust，选择适合自己的计划，设置身份验证方式，例如邮箱一次性验证码。然后在 **Zero Trust → Access → Applications** 中创建一个 **Self-hosted** 应用：

1. 将同一个应用的受保护路径覆盖到以下地址（把示例域名替换为自己的 Worker 主机名）：
   - `my-blog.example.workers.dev/admin*`
   - `my-blog.example.workers.dev/api/admin*`
2. 创建 Allow 策略，仅允许你的管理员邮箱。检查路径规则是否覆盖 `/admin`、`/admin/settings`、`/api/admin` 和 `/api/admin/posts`。使用同一个应用及其 Audience，避免不同应用签发的令牌受众不一致。
3. 在应用详情中找到 **Application Audience (AUD) tag**；同时记录 Zero Trust 的团队域名，格式为 `https://你的团队名.cloudflareaccess.com`。
4. 不要给整个公开博客启用访问登录；只保护管理路径。如有自定义域名或其他可访问入口，也要逐一添加保护并检查优先级。保持不需要的预览地址关闭。[Cloudflare Access 与 Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) · [应用路径规则](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)

在终端分别执行下列命令，按提示交互输入值；不要将值写入仓库或粘贴到公开聊天中：

```sh
npx --no-install wrangler secret put ACCESS_TEAM_DOMAIN --config wrangler.local.toml
npx --no-install wrangler secret put ACCESS_AUD --config wrangler.local.toml
npx --no-install wrangler secret put ADMIN_EMAIL --config wrangler.local.toml
```

`ACCESS_TEAM_DOMAIN` 填完整 `https://…cloudflareaccess.com`，不带末尾路径；`ACCESS_AUD` 填上一步应用的 Audience tag；`ADMIN_EMAIL` 填 Allow 策略中允许的站长邮箱。**每次 `secret put` 都会立即创建并部署一个 Worker 版本**；缺少任何一项或身份不匹配时，管理端保持拒绝访问。[Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

应用除了依赖 Access 页面，还会在服务端校验 JWT 的签名、签发者、受众、有效期和管理员邮箱。不要为省步骤移除验证，也不要将 R2 设为公开。

### 6. 首次验收

- 无痕窗口打开首页，应可匿名阅读；访问 `/admin` 和 `/api/admin/posts` 应被 Access 拦截，不能读取管理数据。对所有域名重复检查。
- 正常窗口访问 `/admin`，使用授权邮箱登录；在“站点设置”修改站名、头像、图标和关于页，上传图片后还需点击“保存设置”。
- 创建测试草稿，上传图片并预览；无痕窗口不得看到草稿及其图片。发布后确认正文和图片正常，再撤回为草稿并确认新请求无法读取。
- 导出备份，并检查 Workers、D1、R2 的使用量与 R2 公开访问设置。

出现 403 时，检查两个路径是否归属同一个 Access 应用、应用 Audience、团队域名及邮箱是否完全一致；也检查是否使用了未受保护的备用域名。更改 Access 或 secrets 后重新登录再检查。

## 使用自己的域名

确认该域名是你 Cloudflare 账户下的活动 zone，并先检查根域名及其他 DNS 记录是否正在供现有服务使用。只把想交给博客的主机名连接到 Worker；根域名和各个子域名是不同主机名。Cloudflare 的 [Custom Domains 文档](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)列出了已有 CNAME 等限制。

在 `wrangler.local.toml` 中添加下列片段，替换为自己的主机名；如不需要 `workers.dev` 地址，将 `workers_dev` 设置为 `false`，再部署：

```toml
[[routes]]
pattern = "example.com"
custom_domain = true
```

首先在 Access 的同一个应用中，为新域名配置 `/admin*` 和 `/api/admin*`；再部署并验证新域名的公开页面、管理员登录及匿名拒绝。若仍启用旧域名或 `workers.dev`，每个地址的管理路径都必须受保护。停用旧地址后仍应检查所有可访问入口。不要删除其他子域名、邮件或现有服务的 DNS 记录。

## 日常使用

打开 `https://你的站点/admin`，通过 Access 登录后新建文章。短链接使用小写英文字母、数字及连字符；填写分类和逗号分隔的标签，可先保存草稿再发布。编辑页面可手动或自动预览，上传图片后插入正文。图片支持 PNG、JPEG、GIF、WebP，每张不超过 5 MiB。

Markdown 使用 `marked`，支持表格、任务列表、引用式链接及嵌套结构。原始 HTML 会转义，链接和图片地址经过安全检查；普通换行显示为换行，因此并非所有 CommonMark 默认行为都相同。站内图片请使用上传后生成的原样 `/media/…` 路径。自动预览会发起受保护的 Worker 请求；浏览器标签页内的未保存内容恢复仅作辅助，不能替代保存草稿和备份。

## 更新

更新前先备份文章和图片，并核对当前 `wrangler.local.toml` 是否仍指向自己的 Worker、数据库和桶。拉取新版本时保留自己的配置，查看版本说明和迁移内容，再运行：

```sh
npm ci
npm test
npx --no-install wrangler d1 migrations apply DB --remote --config wrangler.local.toml
npx --no-install wrangler deploy --config wrangler.local.toml
```

命令会修改远程数据库及生产 Worker；请确认目标账户和资源后执行。没有未应用迁移时 Wrangler 会提示。更新后重新检查首页、文章、图片和后台认证。若项目配置有本地修改，先妥善保存并处理 Git 冲突，不要直接覆盖。

## 备份与恢复

1. 停止写作和上传，后台点击“导出文章备份”，下载包含文章、草稿和站点设置的 JSON。文件含私人内容，请安全保存。
2. 登录后台后在浏览器访问 `/api/admin/images` 获取 R2 对象键清单，通过 R2 控制台下载所有图片并保留原对象键；也可自行选择 Cloudflare 支持的工具批量备份。JSON 不包含图片；更换头像或图标不会自动删除旧图片。
3. 恢复时先创建隔离的空 D1 和新 R2 桶，在新数据库应用迁移。执行 `python3 tools/backup_to_sql.py /安全位置/blog-backup.json > /安全位置/restore.sql`，审阅 SQL，再使用 `wrangler d1 execute DB --remote --file /安全位置/restore.sql --config wrangler.local.toml` 导入**已确认绑定到新数据库**的目标。SQL 为仅插入操作，不用于覆盖现有文章。
4. 按原对象键上传图片并设置正确的 Content-Type，核对文章、草稿、设置和图片后再切换站点。不要直接在生产库试验。备份并非跨 D1/R2 的原子快照，期间应停止写入。不要把备份、图片、SQL 或密钥提交到 Git。

## 图片访问、缓存与费用

公开图片须被已发布文章或公开站点设置引用；草稿预览图片需要管理员身份。每次读取仍先检查 D1 中的公开状态，内部 Cache API 最长缓存图片一小时，未找到对象短暂负缓存；浏览器响应为 `no-store`。缓存按数据中心局部生效，冷缓存或并发请求仍可能读取 R2，无法保证全球命中。外部同键覆盖后旧内容最多可能在边缘缓存保留一小时；推荐通过后台上传生成新地址。

缓存不能限制 IP 请求，也不能阻止恶意流量耗尽 Workers 或 D1 额度。请检查 R2 没有不必要的公开入口，监控 Workers 请求及错误、D1 和 R2 用量，并根据自己的账户设置可用的预算提醒。提醒不是消费上限。将来接入自有域名时，需评估 WAF 限流以及 `workers.dev` 等旁路地址。

## 开发与项目结构

- `src/worker.mjs`：公开路由和图片读取；`src/admin.mjs`：管理接口和认证。
- `src/markdown.mjs`、`src/style.mjs`：Markdown 渲染与样式。
- `migrations/`：D1 数据库迁移；`test/`：Node 内置测试；`tools/`：备份恢复辅助工具。

`npm test` 不需要连接 Cloudflare。使用 `npx --no-install wrangler dev --config wrangler.local.toml` 可启动本地 Worker；先用 `npx --no-install wrangler d1 migrations apply DB --local --config wrangler.local.toml` 初始化本地 D1。普通本地运行不能代替真实 Access 登录和生产安全验收，且本地数据与线上数据分开。需要退出 Wrangler 时使用 `npx --no-install wrangler logout`；不要提交授权文件、`node_modules` 或本地数据。

## 许可与致谢

项目代码按 [MIT License](LICENSE) 授权；改编自 Higan Haozi 的部分保留[原项目版权及 MIT 许可](licenses/higan-haozi-MIT.txt)。感谢原主题作者的设计与开源贡献。博客文章、上传图片及其他个人内容的权利由各自权利人决定，不随代码许可自动授予。
