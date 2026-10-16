# Hellovian 个人主页

根域名 `https://hellovian.com` 的轻量问候页，部署为 Cloudflare Worker `hellovian-home`。静态页面位于 `public/index.html`。

从仓库根目录本地部署：

```sh
npx wrangler deploy --config personal-home/wrangler.jsonc
```

推送到 `main` 后，GitHub Actions 会验证 Function Lab，并自动部署 Function Lab 与个人主页两个独立 Worker。现有 `func.hellovian.com` 不受影响。
