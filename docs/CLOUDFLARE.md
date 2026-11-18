# Function Lab · Cloudflare

## 当前状态（2026-10-15）

本地 94 项数学/回归测试、ESLint、TypeScript 和生产构建通过；桌面与触屏浏览器验收通过。2026-10-15 已通过 Cloudflare Workers Static Assets 发布，并在公网检查了 HTTPS 与首页响应。

正式地址：[`https://func.hellovian.com`](https://func.hellovian.com)（HTTP 200，Cloudflare HTTPS）。
备用地址：[`https://function-lab.hellovian.workers.dev`](https://function-lab.hellovian.workers.dev)（HTTP 200）。

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

Zone 已激活，`wrangler.jsonc` 将 `func.hellovian.com` 配置为 Worker Custom Domain。Cloudflare 已签发 HTTPS 并完成线上访问检查。不要把该 Worker 绑定到根域名或覆盖其他业务记录。

## 上线验收

检查默认地址及自定义域名的 HTTPS、HTML 与 JS/CSS 资源；在空白浏览器上下文中输入并保存函数、执行变换、缩放与导入导出。用 `LAB_URL` 指向线上地址运行现有浏览器回归。浏览器 localStorage 跟随 origin，旧地址的实验不会自动出现在新域名，应通过导出/导入转移。

## 自动发布

仓库的 `.github/workflows/deploy.yml` 在 pull request 执行检查，在 `main` 的 push / 手动运行检查通过后执行正式发布。请勿同时启用两个互相覆盖的发布系统。

GitHub Actions 已随源码推送。检查任务可运行；正式自动发布还需要在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

- `CLOUDFLARE_ACCOUNT_ID`：你自己的 Cloudflare Account ID。
- `CLOUDFLARE_API_TOKEN`：仅具备目标账号所需 Workers 发布权限的 API Token。不要把 token 放在代码、聊天或 README 中。

Worker 运行时密码与密钥通过 `wrangler secret put` 管理，不放在构建变量、前端 bundle 或仓库文件中。Cloudflare 插件、Wrangler 本地登录和 GitHub Actions 发布凭据是三种独立授权，不能假定其中一次登录会自动配好另外两者。

日常流程：本地修改 → 本地检查 → `git add .` → `git commit` → `git push` → GitHub Actions 检查 → Wrangler 发布 → 检查正式 HTTPS 地址。发布失败时保留上一线上版本，修复后再次 push。

## 成本与数据边界

配置面向 Cloudflare 免费能力，没有启用付费订阅或自动扩容。实际使用受账号配额限制；平台要求开通付费能力时应停止并由所有者决定。

不要重命名已有 Durable Object 类、迁移标签或数据实例名称来“修复部署”；这可能产生新的空数据空间。代码发布不等于现有数据迁移，不要删除旧库或覆盖正式用户数据。

## 国内备用入口（2026-11-17）

手机访问 Cloudflare 域名时曾报告连接关闭，同一手机确认可打开国内服务器的备用地址。为便于继续使用，已将 `https://121.199.74.171/function-lab/` 更新至提交 `cf45e11` 的构建；此入口与 Cloudflare 使用不同 origin，浏览器本地数据不会自动共享。切换前可通过项目导出、导入转移实验。

国内服务器发布目录为 `/var/www/function-lab-releases/20261117-cf45e11`；旧版本目录 `/var/www/function-lab-releases/20261013-210328` 保留。该备用入口不会随 GitHub Actions 自动更新，后续发布需单独构建 `--base=/function-lab/` 并部署。此措施不代表原 Cloudflare 域名的连接问题已经解决。

2026-11-18：国内备用入口已切换到 `/var/www/function-lab-releases/20261118-203523-calculus`，包含微积分工作台、负数底数的实数奇次根修复、积分起点提示及导数虚线。保留上一版 `/var/www/function-lab-releases/20261117-cf45e11`，发布前校验服务器上的 HTML、JS 和 CSS 与本地构建一致，切换后验证公网 HTTPS 及新资源。此次只更新国内服务器。
