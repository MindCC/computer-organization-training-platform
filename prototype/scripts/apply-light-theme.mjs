/**
 * 课堂演示页「浅色高对比」机械换色。
 *
 * 用法：node scripts/apply-light-theme.mjs <index.html> [更多文件...]
 * 只改 <style> 块内的颜色，不动结构/脚本；JS 引用的 class 名全部保留。
 * 处理后必须跑各演示页的 verify.mjs 与低对比扫描（scripts/scan-contrast.mjs）。
 */
import { readFileSync, writeFileSync } from "node:fs";

const LIGHT_ROOT = `:root {
    --bg0: #ffffff;
    --bg1: #f1f5f9;
    --panel: #ffffff;
    --line: #cbd5e1;
    --text: #0f172a;
    --muted: #475569;
    --dim: #64748b;
    --cyan: #0369a1;
    --cyan-soft: #0284c7;
    --teal: #0f766e;
    --violet: #6d28d9;
    --amber: #b45309;
    --red: #b91c1c;
    --green: #047857;
  }`;

/** 深色背景通道 → 浅色目标（匹配 rgba(R, G, B, alpha) 任意 alpha，含无空格写法） */
const CHANNEL_RULES = [
  [/rgba\(10,\s*23,\s*56,\s*[0-9.]+\)/g, "#ffffff"],
  [/rgba\(13,\s*30,\s*66,\s*[0-9.]+\)/g, "#f8fafc"],
  [/rgba\(9,\s*18,\s*44,\s*[0-9.]+\)/g, "#f8fafc"],
  [/rgba\(8,\s*18,\s*46,\s*[0-9.]+\)/g, "#f1f5f9"],
  [/rgba\(51,\s*65,\s*100,\s*[0-9.]+\)/g, "#94a3b8"],
  [/rgba\(41,\s*64,\s*95,\s*[0-9.]+\)/g, "#cbd5e1"],
  [/rgba\(14,\s*44,\s*72,\s*[0-9.]+\)/g, "#0369a1"],
  [/rgba\(9,\s*24,\s*52,\s*[0-9.]+\)/g, "#0369a1"],
  [/rgba\(9,\s*24,\s*40,\s*[0-9.]+\)/g, "#047857"],
  [/rgba\(6,\s*52,\s*40,\s*[0-9.]+\)/g, "#047857"],
  [/rgba\(6,\s*40,\s*32,\s*[0-9.]+\)/g, "#dcfce7"],
  [/rgba\(80,\s*12,\s*20,\s*[0-9.]+\)/g, "#fee2e2"],
  [/rgba\(60,\s*45,\s*8,\s*[0-9.]+\)/g, "#fef3c7"],
  [/rgba\(2,\s*8,\s*26,\s*[0-9.]+\)/g, "rgba(15, 23, 42, 0.06)"],
  [/rgba\(15,\s*36,\s*82,\s*[0-9.]+\)/g, "rgba(15, 23, 42, 0.06)"],
  [/rgba\(93,\s*112,\s*153,\s*[0-9.]+\)/g, "#94a3b8"],
  [/rgba\(29,\s*78,\s*216,\s*[0-9.]+\)/g, "#0369a1"],
  [/rgba\(37,\s*99,\s*235,\s*[0-9.]+\)/g, "#0369a1"],
];

/** 浅色文字 hex → 深色/白色（长码在前，词边界防止截断） */
const HEX_RULES = [
  ["#e6f0ff", "#0f172a"], ["#eaf4ff", "#0f172a"], ["#dbeafe", "#0f172a"],
  ["#bfe0ff", "#0f172a"], ["#cfe6ff", "#0f172a"], ["#c6d8f5", "#0f172a"],
  ["#d9f7ff", "#ffffff"], ["#a5ecff", "#ffffff"], ["#e9e2ff", "#ffffff"],
  ["#ddd6fe", "#5b21b6"], ["#99f6e4", "#065f46"], ["#d1fae5", "#065f46"],
  ["#a7f3d0", "#065f46"], ["#fde68a", "#92400e"], ["#fecaca", "#991b1b"],
  ["#d8c9a3", "#78350f"], ["#c6b8f5", "#6d28d9"], ["#04122b", "#ffffff"],
  ["#22d3ee", "#0369a1"], ["#2dd4bf", "#0f766e"], ["#38bdf8", "#0369a1"],
  ["#5d7099", "#64748b"], ["#8ea3c8", "#475569"], ["#f87171", "#b91c1c"],
  ["#fbbf24", "#b45309"], ["#a78bfa", "#6d28d9"], ["#050c22", "#ffffff"],
  ["#0a1738", "#f1f5f9"],
];

/** 强调色 rgba（低透明度→浅底，高透明度→描边/实底） */
const ACCENT_RULES = [
  // cyan 青色
  ["rgba(34, 211, 238, 0.1)", "#e0f2fe"], ["rgba(34, 211, 238, 0.12)", "#e0f2fe"],
  ["rgba(34, 211, 238, 0.14)", "#e0f2fe"], ["rgba(34, 211, 238, 0.15)", "#e0f2fe"],
  ["rgba(34, 211, 238, 0.2)", "#e0f2fe"], ["rgba(34, 211, 238, 0.25)", "#bae6fd"],
  ["rgba(34, 211, 238, 0.3)", "#bae6fd"], ["rgba(34, 211, 238, 0.35)", "#bae6fd"],
  ["rgba(34, 211, 238, 0.4)", "#bae6fd"], ["rgba(34, 211, 238, 0.55)", "#7dd3fc"],
  ["rgba(34, 211, 238, 0.6)", "#7dd3fc"], ["rgba(34, 211, 238, 0.7)", "#7dd3fc"],
  ["rgba(34, 211, 238, 0.75)", "#0369a1"], ["rgba(34, 211, 238, 0.8)", "#7dd3fc"],
  // violet 紫
  ["rgba(167, 139, 250, 0.07)", "#ede9fe"], ["rgba(167, 139, 250, 0.1)", "#ede9fe"],
  ["rgba(167, 139, 250, 0.12)", "#ede9fe"], ["rgba(167, 139, 250, 0.14)", "#ede9fe"],
  ["rgba(167, 139, 250, 0.16)", "#ede9fe"], ["rgba(167, 139, 250, 0.3)", "#c4b5fd"],
  ["rgba(167, 139, 250, 0.4)", "#c4b5fd"], ["rgba(167, 139, 250, 0.45)", "#c4b5fd"],
  ["rgba(167, 139, 250, 0.5)", "#c4b5fd"], ["rgba(167, 139, 250, 0.55)", "#c4b5fd"],
  ["rgba(167, 139, 250, 0.6)", "#c4b5fd"], ["rgba(167, 139, 250, 0.75)", "#c4b5fd"],
  ["rgba(167, 139, 250, 0.8)", "#c4b5fd"], ["rgba(167, 139, 250, 0.9)", "#c4b5fd"],
  // amber 琥珀
  ["rgba(251, 191, 36, 0.08)", "#fef3c7"], ["rgba(251, 191, 36, 0.1)", "#fef3c7"],
  ["rgba(251, 191, 36, 0.12)", "#fef3c7"], ["rgba(251, 191, 36, 0.14)", "#fef3c7"],
  ["rgba(251, 191, 36, 0.16)", "#fef3c7"], ["rgba(251, 191, 36, 0.18)", "#fef3c7"],
  ["rgba(251, 191, 36, 0.2)", "#fef3c7"], ["rgba(251, 191, 36, 0.25)", "#fcd34d"],
  ["rgba(251, 191, 36, 0.3)", "#fcd34d"], ["rgba(251, 191, 36, 0.35)", "#fcd34d"],
  ["rgba(251, 191, 36, 0.4)", "#fcd34d"], ["rgba(251, 191, 36, 0.45)", "#fcd34d"],
  ["rgba(251, 191, 36, 0.5)", "#fcd34d"], ["rgba(251, 191, 36, 0.55)", "#d97706"],
  ["rgba(251, 191, 36, 0.6)", "#d97706"], ["rgba(251, 191, 36, 0.7)", "#d97706"],
  ["rgba(251, 191, 36, 0.75)", "#d97706"], ["rgba(251, 191, 36, 0.8)", "#d97706"],
  ["rgba(251, 191, 36, 0.85)", "#d97706"],
  // green 绿
  ["rgba(52, 211, 153, 0.1)", "#dcfce7"], ["rgba(52, 211, 153, 0.12)", "#dcfce7"],
  ["rgba(52, 211, 153, 0.14)", "#dcfce7"], ["rgba(52, 211, 153, 0.15)", "#dcfce7"],
  ["rgba(52, 211, 153, 0.16)", "#dcfce7"], ["rgba(52, 211, 153, 0.25)", "#6ee7b7"],
  ["rgba(52, 211, 153, 0.3)", "#6ee7b7"], ["rgba(52, 211, 153, 0.35)", "#6ee7b7"],
  ["rgba(52, 211, 153, 0.4)", "#6ee7b7"], ["rgba(52, 211, 153, 0.45)", "#6ee7b7"],
  ["rgba(52, 211, 153, 0.5)", "#34d399"], ["rgba(52, 211, 153, 0.55)", "#34d399"],
  ["rgba(52, 211, 153, 0.6)", "#34d399"], ["rgba(52, 211, 153, 0.7)", "#34d399"],
  ["rgba(52, 211, 153, 0.8)", "#34d399"],
  // red 红
  ["rgba(248, 113, 113, 0.1)", "#fee2e2"], ["rgba(248, 113, 113, 0.12)", "#fee2e2"],
  ["rgba(248, 113, 113, 0.14)", "#fee2e2"], ["rgba(248, 113, 113, 0.25)", "#fca5a5"],
  ["rgba(248, 113, 113, 0.35)", "#fca5a5"], ["rgba(248, 113, 113, 0.4)", "#fca5a5"],
  ["rgba(248, 113, 113, 0.45)", "#fca5a5"], ["rgba(248, 113, 113, 0.5)", "#fca5a5"],
  ["rgba(248, 113, 113, 0.55)", "#dc2626"], ["rgba(248, 113, 113, 0.6)", "#dc2626"],
  ["rgba(248, 113, 113, 0.85)", "#dc2626"],
  // blue 蓝
  ["rgba(56, 132, 255, 0.06)", "rgba(15, 23, 42, 0.045)"],
  ["rgba(56, 132, 255, 0.07)", "#f0f9ff"], ["rgba(56, 132, 255, 0.08)", "#f0f9ff"],
  ["rgba(56, 132, 255, 0.1)", "#f0f9ff"], ["rgba(56, 132, 255, 0.16)", "#e0f2fe"],
  ["rgba(56, 132, 255, 0.18)", "#e0f2fe"], ["rgba(56, 132, 255, 0.2)", "#e0f2fe"],
  ["rgba(56, 132, 255, 0.22)", "#bae6fd"], ["rgba(56, 132, 255, 0.25)", "#bae6fd"],
  ["rgba(56, 132, 255, 0.28)", "#cbd5e1"], ["rgba(56, 132, 255, 0.3)", "#cbd5e1"],
  ["rgba(56, 132, 255, 0.35)", "#cbd5e1"], ["rgba(56, 132, 255, 0.4)", "#cbd5e1"],
  ["rgba(56, 132, 255, 0.45)", "#cbd5e1"], ["rgba(56, 132, 255, 0.5)", "#cbd5e1"],
  ["rgba(56, 132, 255, 0.55)", "#cbd5e1"],
  // cyan-soft 描边
  ["rgba(125, 211, 252, 0.35)", "#bae6fd"], ["rgba(125, 211, 252, 0.4)", "#7dd3fc"],
  ["rgba(125, 211, 252, 0.45)", "#7dd3fc"], ["rgba(125, 211, 252, 0.5)", "#7dd3fc"],
  ["rgba(125, 211, 252, 0.7)", "#7dd3fc"], ["rgba(125, 211, 252, 0.8)", "#7dd3fc"],
  ["rgba(125, 211, 252, 0.85)", "#0369a1"], ["rgba(125, 211, 252, 0.9)", "#0369a1"],
  ["rgba(125, 211, 252, 0.95)", "#0369a1"],
  // glow 辉光（统一柔化）
  ["rgba(56, 189, 248, 0.25)", "rgba(2, 132, 199, 0.2)"], ["rgba(56, 189, 248, 0.3)", "rgba(2, 132, 199, 0.2)"],
  ["rgba(56, 189, 248, 0.35)", "rgba(2, 132, 199, 0.2)"], ["rgba(56, 189, 248, 0.4)", "rgba(2, 132, 199, 0.2)"],
  ["rgba(56, 189, 248, 0.45)", "rgba(2, 132, 199, 0.2)"], ["rgba(56, 189, 248, 0.5)", "rgba(2, 132, 199, 0.2)"],
  ["rgba(56, 189, 248, 0.7)", "rgba(2, 132, 199, 0.2)"], ["rgba(56, 189, 248, 0.8)", "rgba(2, 132, 199, 0.2)"],
  // teal 青绿
  ["rgba(45, 212, 191, 0.10)", "rgba(15, 118, 110, 0.07)"], ["rgba(45, 212, 191, 0.1)", "#d1fae5"],
  ["rgba(45, 212, 191, 0.5)", "#5eead4"], ["rgba(45, 212, 191, 0.6)", "#5eead4"],
];

/** 渐变类替换 */
const GRADIENT_RULES = [
  ["linear-gradient(90deg, #7dd3fc, #38bdf8 45%, #2dd4bf)", "linear-gradient(90deg, #0c4a6e, #0369a1 45%, #0f766e)"],
  ["linear-gradient(90deg, var(--cyan-soft), var(--teal))", "#0369a1"],
  ["linear-gradient(90deg, rgba(29, 78, 216, 0.85), rgba(37, 99, 235, 0.85))", "#0369a1"],
  ["linear-gradient(90deg, rgba(29, 78, 216, 0.8), rgba(37, 99, 235, 0.8))", "#0369a1"],
  ["linear-gradient(90deg, rgba(29,78,216,0.85), rgba(37,99,235,0.85))", "#0369a1"],
  ["linear-gradient(90deg, rgba(29,78,216,0.8), rgba(37,99,235,0.8))", "#0369a1"],
  ["linear-gradient(150deg, rgba(14, 44, 72, 0.95), rgba(9, 24, 52, 0.95))", "#0369a1"],
  ["linear-gradient(150deg, rgba(6, 52, 40, 0.95), rgba(9, 24, 40, 0.95))", "#047857"],
  ["linear-gradient(150deg, rgba(14,44,72,0.95), rgba(9,24,52,0.95))", "#0369a1"],
  ["linear-gradient(150deg, rgba(6,52,40,0.95), rgba(9,24,40,0.95))", "#047857"],
  ["linear-gradient(90deg, var(--amber), var(--red))", "#b45309"],
  ["linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.7), transparent)", "linear-gradient(90deg, transparent, #94a3b8, transparent)"],
  ["radial-gradient(1100px 520px at 85% -10%, rgba(56, 132, 255, 0.16), transparent 62%)", "radial-gradient(1100px 520px at 85% -10%, rgba(2, 132, 199, 0.10), transparent 62%)"],
  ["radial-gradient(800px 480px at 5% 112%, rgba(45, 212, 191, 0.10), transparent 55%)", "radial-gradient(800px 480px at 5% 112%, rgba(15, 118, 110, 0.07), transparent 55%)"],
];

/** 追加在 </style> 前的兜底块：点亮/实底状态在浅色底上必须有深色填充 */
const OVERRIDE_BLOCK = `

  /* ── 浅色高对比补充（apply-light-theme.mjs 追加） ── */
  .bit.on { background: #0369a1; color: #ffffff; border-color: #0369a1; }
  .bit.on small { color: rgba(255, 255, 255, 0.8); }
  .bit.sign.on { background: #6d28d9; border-color: #6d28d9; color: #ffffff; }
  .bit.result-bit.on, .bit.enter { background: #047857; border-color: #047857; color: #ffffff; }
  .mode-tabs button.active, .sub-toggle button.active, .toggle-row button.active,
  .clock-actions button.active { background: #0369a1; color: #ffffff; border-color: #0369a1; box-shadow: none; }
  .controls .play-btn, .inline-steps .inline-play, .inline-steps button.primary,
  .quiz-actions button { background: #0369a1; color: #ffffff; border-color: #0369a1; box-shadow: none; }
  .act-chip.active, .stage-chip.active, .tl-cell.active, .beat-cell.active,
  .irq-chip.active, .pipe-chip.active, .preset-btn.active {
    border-color: #0369a1; background: #e0f2fe; color: #0f172a; box-shadow: none;
  }
  .stage-chip.done, .irq-chip.done, .beat-cell.done, .act-chip.done { border-color: #34d399; color: #065f46; }
  .sig-chip { color: #475569; }
  .beat-cell.active .sig-chip { border-color: #0369a1; color: #0369a1; background: #e0f2fe; }
  .clock-node.pos circle { fill: #0369a1; stroke: #0369a1; }
  .clock-node.pos text { fill: #ffffff; }
`;

function replaceRootBlock(css) {
  const match = css.match(/:root\s*\{[\s\S]*?\}/);
  if (!match) throw new Error("找不到 :root 块");
  return css.replace(match[0], LIGHT_ROOT);
}

export function applyLightTheme(css) {
  let out = replaceRootBlock(css);
  // 先统一 rgba 空格写法（rgba(56,132,255,0.08) 与 rgba(56, 132, 255, 0.08) 都归一为后者）
  out = out.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*/g, "rgba($1, $2, $3, ");
  for (const [pattern, target] of CHANNEL_RULES) out = out.replace(pattern, target);
  for (const [from, to] of GRADIENT_RULES) out = out.split(from).join(to);
  for (const [from, to] of ACCENT_RULES) out = out.split(from).join(to);
  for (const [from, to] of HEX_RULES) {
    out = out.replace(new RegExp(from.replace("#", "#") + "\\b", "g"), to);
  }
  // 投影屏不需要文字辉光
  out = out.replace(/text-shadow:[^;}]+;/g, "text-shadow: none;");
  return out;
}

function processFile(path) {
  const html = readFileSync(path, "utf8");
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!styleMatch) throw new Error(`${path} 找不到 <style> 块`);
  const themed = applyLightTheme(styleMatch[1]);
  const result = html.slice(0, styleMatch.index) + "<style>" + themed + OVERRIDE_BLOCK + "\n</style>" + html.slice(styleMatch.index + styleMatch[0].length);
  writeFileSync(path, result, "utf8");
  return { path, styleBytes: styleMatch[1].length };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("用法：node scripts/apply-light-theme.mjs <index.html> [...]");
  process.exit(1);
}
for (const file of files) {
  const { path: done } = processFile(file);
  console.log(`✔ ${done}`);
}
