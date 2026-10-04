/**
 * 生成「课堂演示版」静态站点（可直接拖到任意静态托管上）。
 *
 * 背景：平台本体是 Express + better-sqlite3 + React 的全栈应用，静态托管跑不了后端；
 * 而 8 个课堂演示页与课件页本身就是纯前端单文件，天然可以静态发布。
 * 这个脚本把它们（连同导航首页）组装成一个自包含目录，作为"预览演示版本"。
 *
 * 用法：
 *   node scripts/previewSite.mjs            # 生成 ../preview
 *   node scripts/previewSite.mjs --check    # 只校验已提交的 ../preview 是否与源文件一致（CI/单测用）
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COURSEWARE } from "../src/courseware.js";
import { COURSE_CHAPTERS } from "../src/courseChapters.js";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
export const PROTOTYPE_ROOT = join(scriptsDir, "..");
export const REPO_ROOT = join(PROTOTYPE_ROOT, "..");
export const PUBLIC_DIR = join(PROTOTYPE_ROOT, "public");
export const DEFAULT_TARGET_DIR = join(REPO_ROOT, "preview");

const SITE_TITLE = "计算机组成原理实训平台 · 课堂演示版";
const REPO_URL = "https://gitee.com/cplus1/composition-principle-platform";
const BRAND_ASSETS = [
  { from: join(PUBLIC_DIR, "home", "wordmark.png"), to: "home/wordmark.png" },
  { from: join(PUBLIC_DIR, "home", "logo.png"), to: "home/logo.png" },
];

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** 站点里所有需要落地的文件：源文件 → 目标相对路径。 */
export function collectPreviewFiles() {
  const files = [
    { from: join(PUBLIC_DIR, "courseware.html"), to: "courseware.html" },
    { from: join(PUBLIC_DIR, "demos", "platform-link.js"), to: "demos/platform-link.js" },
    { from: join(PUBLIC_DIR, "demos", "adder-alu-core.js"), to: "demos/adder-alu-core.js" },
    { from: join(PUBLIC_DIR, "demos", "demo-theme.css"), to: "demos/demo-theme.css" },
    ...BRAND_ASSETS,
  ];
  for (const chapter of COURSEWARE.chapters) {
    for (const demo of chapter.demos ?? []) {
      files.push({ from: join(PUBLIC_DIR, demo.href.replace(/^\//, "")), to: `demos/${demo.href.split("/").pop()}` });
    }
  }
  return files;
}

/** 导航首页：章节分组卡片，卡片数据直接来自 courseware.js，避免两处维护。 */
export function renderIndexHtml() {
  const demoGroups = COURSE_CHAPTERS.map((chapter) => {
    const source = COURSEWARE.chapters.find((item) => item.id === chapter.id) ?? {};
    return { chapter, demos: source.demos ?? [] };
  }).filter((group) => group.demos.length > 0);

  const cards = demoGroups.map((group) => `
      <section class="chapter">
        <h2>${group.chapter.title}</h2>
        <div class="cards">
          ${group.demos.map((demo) => `
          <a class="card" href="demos/${demo.href.split("/").pop()}" target="_blank" rel="noreferrer">
            <strong>${demo.title}</strong>
            <p>${demo.note}</p>
            <span class="open">打开演示 →</span>
          </a>`).join("")}
        </div>
      </section>`).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${SITE_TITLE}</title>
<style>
  :root { --bg:#050c22; --panel:rgba(10,23,56,.82); --line:rgba(56,132,255,.28); --text:#e6f0ff; --muted:#8ea3c8; --dim:#5d7099; --cyan:#38bdf8; --teal:#2dd4bf; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { min-height:100vh; color:var(--text); font-family:"Microsoft YaHei","PingFang SC","Segoe UI",system-ui,sans-serif;
    background:radial-gradient(1100px 520px at 85% -10%, rgba(56,132,255,.16), transparent 62%),
      radial-gradient(800px 480px at 5% 112%, rgba(45,212,191,.10), transparent 55%),
      linear-gradient(180deg, var(--bg) 0%, #0a1738 55%, var(--bg) 100%); }
  body::before { content:""; position:fixed; inset:0; pointer-events:none;
    background-image:linear-gradient(rgba(56,132,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56,132,255,.06) 1px, transparent 1px);
    background-size:44px 44px; mask-image:radial-gradient(ellipse at 50% 24%, black 30%, transparent 78%); }
  .app { position:relative; max-width:1180px; margin:0 auto; padding:34px 24px 56px; }
  header { display:grid; gap:14px; justify-items:center; text-align:center; padding:14px 0 26px; }
  .brand { display:flex; align-items:center; gap:14px; }
  /* logo/wordmark 原图是给浅色顶栏用的黑字大留白 PNG：这里裁掉留白并反相，才配暗色底。 */
  .brand-mark { width:56px; height:56px; border-radius:15px; background:#fff url("home/logo.png") center/250% no-repeat;
    box-shadow:0 8px 22px rgba(2,8,26,.5); }
  .brand-word { width:196px; height:56px; background:url("home/wordmark.png") center/auto 340% no-repeat; filter:invert(1) brightness(1.35); }
  .badge { display:inline-block; font-size:12.5px; letter-spacing:.18em; color:#7dd3fc; border:1px solid rgba(125,211,252,.4); border-radius:999px; padding:5px 16px; background:rgba(56,132,255,.08); }
  h1 { font-size:30px; letter-spacing:.04em; background:linear-gradient(90deg,#7dd3fc,#38bdf8 45%,#2dd4bf); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .lede { max-width:760px; color:var(--muted); font-size:14.5px; line-height:1.85; }
  .lede b { color:#a5ecff; }
  .notice { max-width:820px; border:1px solid rgba(251,191,36,.4); background:rgba(251,191,36,.08); color:#fde68a;
    border-radius:12px; padding:12px 16px; font-size:13.5px; line-height:1.75; text-align:left; }
  .grid { display:grid; gap:22px; }
  .chapter { display:grid; gap:12px; }
  .chapter h2 { font-size:16px; color:#cfe6ff; letter-spacing:.08em; padding-left:12px; border-left:3px solid var(--teal); }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
  .card { display:grid; gap:8px; align-content:start; border:1px solid var(--line); border-radius:16px; background:var(--panel);
    padding:16px 18px; color:inherit; text-decoration:none; box-shadow:inset 0 0 32px rgba(15,36,82,.45), 0 10px 30px rgba(2,8,26,.4);
    transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
  .card:hover { transform:translateY(-3px); border-color:rgba(125,211,252,.75); box-shadow:0 0 26px rgba(56,189,248,.28); }
  .card strong { font-size:15.5px; color:#eaf4ff; }
  .card p { color:var(--muted); font-size:13px; line-height:1.7; }
  .card .open { color:var(--teal); font-size:13px; font-weight:700; }
  footer { margin-top:34px; display:grid; gap:14px; }
  .panel { border:1px solid var(--line); border-radius:16px; background:var(--panel); padding:18px 20px; }
  .panel h3 { font-size:15px; color:#cfe6ff; margin-bottom:8px; }
  .panel p, .panel li { color:var(--muted); font-size:13.5px; line-height:1.85; }
  .panel ul { margin:6px 0 0 18px; }
  .panel code { font-family:Consolas,monospace; color:var(--amber,#fbbf24); background:rgba(251,191,36,.1); padding:1px 7px; border-radius:6px; }
  .panel a { color:#7dd3fc; }
  @media (max-width:720px) { h1 { font-size:23px; } .app { padding:22px 16px 40px; } }
</style>
</head>
<body>
<div class="app">
  <header>
    <div class="brand">
      <span class="brand-mark" role="img" aria-label="芯游记"></span>
      <span class="brand-word" role="img" aria-label="芯游记 ChipQuest"></span>
    </div>
    <span class="badge">课 堂 演 示 版 · 静 态 预 览</span>
    <h1>计算机组成原理实训平台</h1>
    <p class="lede">这里收录了 <b>8 个章节互动演示</b>与<b>课程课件页</b>：每一步运算、每一条连线都按教材章节组织，打开即用，不需要登录。</p>
    <p class="notice">本页是静态预览：演示页运行在<b>独立模式</b>下，随堂练习只在本页计数，不会上传学情。完整平台（登录、24 个章节实验、学情大屏、教师看板）需要运行 Node 后端，见页面底部说明。</p>
  </header>

  <main class="grid">
    <section class="chapter">
      <h2>课程课件</h2>
      <div class="cards">
        <a class="card" href="courseware.html" target="_blank" rel="noreferrer">
          <strong>计算机组成原理 · 交互课件</strong>
          <p>八章课件：冯·诺依曼结构、数制与编码、运算器、存储器、指令系统、CPU、总线、输入输出。</p>
          <span class="open">打开课件 →</span>
        </a>
      </div>
    </section>
${cards}
  </main>

  <footer>
    <div class="panel">
      <h3>怎么用这个预览站</h3>
      <ul>
        <li>直接把本目录（<code>preview/</code>）拖到 Netlify Drop，或上传到 Cloudflare Pages 的 Direct Upload，就能得到一个公开链接。</li>
        <li>也可以本地打开：双击 <code>preview/index.html</code>，或用 <code>npx serve preview</code> 起一个本地服务。</li>
        <li>这些页面是自包含的单文件 HTML，放到任意静态托管、U 盘或校内共享盘都能跑。</li>
      </ul>
    </div>
    <div class="panel">
      <h3>想要完整平台</h3>
      <p>完整版包含账号登录、按章节的 24 个实验、蓝色学情大屏（学习树）、错题本、课堂任务与教师看板，需要 Node 运行环境：</p>
      <ul>
        <li><code>cd prototype &amp;&amp; npm install</code></li>
        <li><code>npm run seed:teacher &amp;&amp; npm run seed:demo</code>（初始化演示班级）</li>
        <li><code>npm run server</code> 与 <code>npm run dev</code>，浏览器打开 <code>http://127.0.0.1:5173</code></li>
      </ul>
      <p>仓库地址：<a href="${REPO_URL}" target="_blank" rel="noreferrer">${REPO_URL}</a></p>
    </div>
    <div class="panel">
      <h3>目录结构</h3>
      <ul>
        <li><code>index.html</code> 本导航页</li>
        <li><code>courseware.html</code> 交互课件</li>
        <li><code>demos/*.html</code> 八个章节课堂演示</li>
        <li><code>demos/platform-link.js</code> 学情联动脚本（静态预览下自动降级为独立模式）</li>
      </ul>
    </div>
  </footer>
</div>
</body>
</html>
`;
}

const README = `# 课堂演示版（静态预览）

由 \`prototype/scripts/previewSite.mjs\` 生成，**不要手工修改**——改了会被 \`npm test\` 的漂移检查拦下。

重新生成：

\`\`\`bash
cd prototype
npm run preview:site
\`\`\`

## 部署

- **Netlify Drop**：打开 https://app.netlify.com/drop ，把这个目录拖进去，立刻得到公开链接。
- **Cloudflare Pages**：Create project → Direct Upload → 把本目录打包成 zip 上传。
- **GitHub Pages**：把本目录推到 \`gh-pages\` 分支（\`.nojekyll\` 已就位）。
- **本地**：双击 \`index.html\`，或 \`npx serve preview\`。

## 说明

演示页是纯前端单文件，静态托管下 \`platform-link.js\` 会自动降级为"独立模式"（练习成绩只在本页计数）。
完整的登录、学情、教师看板需要运行 \`prototype\` 里的 Node 后端。
`;

/** 构建（或校验）预览站。check 模式只比较内容，不写盘。 */
export function buildPreviewSite({ targetDir = DEFAULT_TARGET_DIR, check = false } = {}) {
  const files = collectPreviewFiles();
  const generated = [
    { to: "index.html", content: renderIndexHtml() },
    { to: "README.md", content: README },
    { to: ".nojekyll", content: "" },
  ];

  const missingSources = files.filter((file) => !existsSync(file.from)).map((file) => file.from);
  if (missingSources.length > 0) {
    return { ok: false, targetDir, problems: missingSources.map((file) => `缺少源文件：${file}`) };
  }

  const problems = [];
  if (check) {
    if (!existsSync(targetDir)) {
      return { ok: false, targetDir, problems: ["预览站目录不存在，请运行 npm run preview:site"] };
    }
    for (const file of files) {
      const target = join(targetDir, file.to);
      if (!existsSync(target)) { problems.push(`缺少 ${file.to}`); continue; }
      if (sha256(target) !== sha256(file.from)) problems.push(`${file.to} 与源文件不一致`);
    }
    for (const item of generated) {
      const target = join(targetDir, item.to);
      if (!existsSync(target)) { problems.push(`缺少 ${item.to}`); continue; }
      if (readFileSync(target, "utf8") !== item.content) problems.push(`${item.to} 不是最新生成的版本`);
    }
    const expected = new Set([...files.map((file) => file.to), ...generated.map((item) => item.to)]);
    for (const name of ["index.html", "courseware.html", "README.md", ".nojekyll", "demos/platform-link.js"]) {
      expected.add(name);
    }
    return { ok: problems.length === 0, targetDir, problems, fileCount: expected.size };
  }

  // Update generated files without deleting standalone demo sources or user files.
  mkdirSync(join(targetDir, "demos"), { recursive: true });
  mkdirSync(join(targetDir, "home"), { recursive: true });
  for (const file of files) {
    const target = join(targetDir, file.to);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file.from, target);
  }
  for (const item of generated) {
    writeFileSync(join(targetDir, item.to), item.content, "utf8");
  }
  return { ok: true, targetDir, problems: [], fileCount: files.length + generated.length };
}

if (process.argv[1] && import.meta.url.replace(/\/+$/, "").endsWith(process.argv[1].replace(/\\/g, "/").replace(/\/+$/, ""))) {
  const check = process.argv.includes("--check");
  const result = buildPreviewSite({ check });
  if (!result.ok) {
    console.error(`预览站${check ? "校验" : "生成"}失败：`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(check
    ? `预览站校验通过：${result.targetDir}（${result.fileCount} 个文件与源文件一致）`
    : `预览站已生成：${result.targetDir}（${result.fileCount} 个文件）`);
}
