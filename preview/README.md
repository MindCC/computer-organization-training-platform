# 课堂演示版（静态预览）

由 `prototype/scripts/previewSite.mjs` 生成，**不要手工修改**——改了会被 `npm test` 的漂移检查拦下。

重新生成：

```bash
cd prototype
npm run preview:site
```

## 部署

- **Netlify Drop**：打开 https://app.netlify.com/drop ，把这个目录拖进去，立刻得到公开链接。
- **Cloudflare Pages**：Create project → Direct Upload → 把本目录打包成 zip 上传。
- **GitHub Pages**：把本目录推到 `gh-pages` 分支（`.nojekyll` 已就位）。
- **本地**：双击 `index.html`，或 `npx serve preview`。

## 说明

演示页是纯前端单文件，静态托管下 `platform-link.js` 会自动降级为"独立模式"（练习成绩只在本页计数）。
完整的登录、学情、教师看板需要运行 `prototype` 里的 Node 后端。
