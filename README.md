# ZxcxBlog

面向 Cloudflare Workers 的个人博客：公开阅读、Markdown 写作、D1 文章与 R2 图片。视觉参考 Higan Haozi；当前样式是独立实现，未复制原主题代码、作者内容或资源。初始名称、简介在 `wrangler.toml` 修改；关于页在 `src/worker.mjs` 修改。项目不包含示例文章。Markdown 当前支持标题、段落、无序列表、引用、粗斜体、链接、图片和代码块；复杂表格、任务列表等尚未支持。

## 部署前必须完成

1. 使用项目内 Wrangler 登录自己的 Cloudflare 账户，检查账户身份；在该账户创建 D1 数据库 `zxcx-blog` 和 R2 存储桶 `zxcx-blog-images`。`wrangler.toml` 已配置当前账户新建的 D1 ID；迁移到其他账户时应更换，不要把凭据写入代码。
2. 启用 Cloudflare Zero Trust 并创建 Access 应用，保护 `/admin*` 与 `/api/admin/*`，为站长邮箱配置允许策略。只保护管理路径，公开博客保持匿名访问。对每个可访问域名和预览 URL 均检查保护；关闭不需要的地址。应用从每个请求验证 Access 签名、签发者、受众、到期时间和站长邮箱，缺失配置时拒绝管理访问。
3. 配置 `ACCESS_TEAM_DOMAIN`（如 `https://team.cloudflareaccess.com`）、`ACCESS_AUD`（该 Access 应用的 audience tag）和 `ADMIN_EMAIL`；确保部署域名和 Access 应用一致。邮箱可在部署时作为 Worker 变量设置，不应提交私人配置。
4. 使用 `wrangler d1 migrations apply zxcx-blog --remote` 应用迁移，再用 `wrangler deploy` 部署；首次使用 `workers.dev`。登录后测试草稿、发布、图片和备份；匿名访问管理端、写入接口和草稿图片必须被拒绝。确认配置与测试完成前不要对外宣传地址。

安装与执行应使用本机已授权的项目内工具，例如将 mise 的 Node 目录加入 PATH 后使用 `./node_modules/.bin/wrangler`。详细行为以 Cloudflare Access 和 Workers 当前官方文档为准。`preview_urls = false` 禁止额外预览地址，实际控制台配置仍须检查；Worker 同时自行验证令牌，防止其它地址绕开 Access 保护。

## 备份与恢复

后台“导出文章备份”会下载 JSON，包含每篇文章的 Markdown 正文、元数据、草稿和发布时间。请妥善保管；这是敏感的私人数据。它不包含图片。先停止写入，备份文章并记录时间后，在已经登录的浏览器访问 `/api/admin/images` 获取完整 R2 对象键清单，再通过 Cloudflare R2 控制台逐个下载图片，原样保存文件名；两者一起保存。可使用 Cloudflare 文档支持的 S3 兼容工具做批量备份，但本项目不自动安装该工具。

恢复到隔离的新数据库和新桶：先应用迁移，运行 `python3 tools/backup_to_sql.py /安全位置/blog-backup.json > /安全位置/restore.sql`，审阅后通过 Wrangler 对新 D1 执行 SQL 文件；SQL 只插入数据，不覆盖已有文章，冲突时应停止并检查。将图片以原对象键上传到新 R2 桶，并分别为 png/jpg/gif/webp 设置正确的 Content-Type。切换前核对文章、草稿、图片数量与内容；不要在生产库直接试验。备份不是跨 D1/R2 的原子快照，备份期间不要写作或上传。不要将备份、SQL、密钥或上传图片提交到 Git。

## 检查

`npm test` 运行 Node 内置测试。部署和本地 Cloudflare 集成测试需要项目内 Wrangler。管理员认证和数据变更必须通过独立安全审查与真实 Cloudflare 环境验收后才可投入使用。

项目的 Wrangler 授权位于被 Git 忽略的 `.wrangler/config/`；它包含 Cloudflare OAuth 凭据。需要移除授权时可使用同一配置目录执行 `wrangler logout`，或先在 Cloudflare 撤销授权，再删除该目录。`node_modules/` 仅包含项目依赖，删除后可按锁文件重新安装。
