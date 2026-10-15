# Function Lab · Cloudflare

## 当前状态（2026-10-15）

本地 94 项数学/回归测试、ESLint、TypeScript 和生产构建通过；桌面与触屏浏览器验收通过。Cloudflare 发布配置和 GitHub Actions 已写入，首次线上发布待账号发布授权完成。

默认地址目标：`https://function-lab.hellovian.workers.dev`。
首选域名目标：`https://func.hellovian.com`。
以上地址目前是部署目标，不代表已通过线上访问验收。

## 发布

```sh
npm ci
npm run check
npm run deploy
```

使用 Workers Static Assets，从 `dist/` 发布，不需要 D1、KV、R2、外部 API 或 `.env`。应用在 `/` 下运行，Vite 默认 base 适用，不沿用历史服务器的 `/function-lab/` 子路径。

## 域名

已将 `hellovian.com` 加入 Cloudflare 免费 Zone。当前需要在阿里云注册商将域名的 DNS 服务器改成：

```text
daisy.ns.cloudflare.com
dante.ns.cloudflare.com
```

Zone 激活后，在 `wrangler.jsonc` 添加 `routes`：

```json
[{"pattern":"func.hellovian.com","custom_domain":true}]
```

然后重新发布，由 Cloudflare 管理 DNS 与 HTTPS。不要把该 Worker 绑定到根域名或覆盖其他业务记录。

## 上线验收

检查默认地址及自定义域名的 HTTPS、HTML 与 JS/CSS 资源；在空白浏览器上下文中输入并保存函数、执行变换、缩放与导入导出。用 `LAB_URL` 指向线上地址运行现有浏览器回归。浏览器 localStorage 跟随 origin，旧地址的实验不会自动出现在新域名，应通过导出/导入转移。

## 自动发布

仓库的 `.github/workflows/deploy.yml` 在 pull request 执行检查，在 `main` 的 push / 手动运行检查通过后执行正式发布。请勿同时启用两个互相覆盖的发布系统。

需要在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

- `CLOUDFLARE_ACCOUNT_ID`：你自己的 Cloudflare Account ID。
- `CLOUDFLARE_API_TOKEN`：仅具备目标账号所需 Workers 发布权限的 API Token。不要把 token 放在代码、聊天或 README 中。

Worker 运行时密码与密钥通过 `wrangler secret put` 管理，不放在构建变量、前端 bundle 或仓库文件中。Cloudflare 插件、Wrangler 本地登录和 GitHub Actions 发布凭据是三种独立授权，不能假定其中一次登录会自动配好另外两者。

日常流程：本地修改 → 本地检查 → `git add .` → `git commit` → `git push` → GitHub Actions 检查 → Wrangler 发布 → 检查正式 HTTPS 地址。发布失败时保留上一线上版本，修复后再次 push。

## 成本与数据边界

配置面向 Cloudflare 免费能力，没有启用付费订阅或自动扩容。实际使用受账号配额限制；平台要求开通付费能力时应停止并由所有者决定。

不要重命名已有 Durable Object 类、迁移标签或数据实例名称来“修复部署”；这可能产生新的空数据空间。代码发布不等于现有数据迁移，不要删除旧库或覆盖正式用户数据。
