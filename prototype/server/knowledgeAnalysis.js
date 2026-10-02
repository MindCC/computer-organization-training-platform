/**
 * 知识库自动分析（LLMWiki 核心）：摘要 + 要点列表 + 关键词。
 * 有 DEEPSEEK_API_KEY 时走 LLM（复用 aiClient 的 DeepSeek 通道与安全闸）；
 * 无 key 或 LLM 失败时降级为本地规则分析（首段+高频句摘要、词频关键词、按句评分取要点）。
 */
import { readDeepSeekConfig, requestChatCompletion, createAiError } from "./aiClient.js";

const MAX_KEY_POINTS = 5;
const MAX_KEYWORDS = 8;
const LLM_EXCERPT_CHARS = 3000;
const SUMMARY_MAX_CHARS = 220;
const POINT_MAX_CHARS = 90;

export async function analyzeKnowledgeDocument({ title, text }, { env = process.env } = {}) {
  const config = readDeepSeekConfig(env);
  if (!config.enabled) {
    return { ...buildLocalAnalysis({ title, text }), source: "local", fallbackReason: "AI_DISABLED" };
  }
  try {
    const messages = buildAnalysisMessages({ title, text });
    const content = await requestChatCompletion(config, messages);
    const analysis = parseAnalysisJson(content);
    return { ...analysis, source: "ai" };
  } catch (error) {
    // LLM 失败不阻断入库：本地规则兜底，并记录降级原因
    return {
      ...buildLocalAnalysis({ title, text }),
      source: "local",
      fallbackReason: error?.code ?? error?.message ?? "AI_ERROR",
    };
  }
}

function buildAnalysisMessages({ title, text }) {
  const excerpt = String(text).slice(0, LLM_EXCERPT_CHARS);
  return [
    {
      role: "user",
      content: [
        "你是《计算机组成原理》课程的学习知识库助手，正在为学生上传的一篇课程文档生成结构化分析。",
        "只依据给出的文档正文分析，不要编造正文没有的内容。中文输出。",
        "严格输出 JSON（不要 Markdown、不要额外解释），必须包含字段：",
        "summary（字符串：120字以内的全文摘要，说明这篇文档讲了什么、重点在哪）、",
        "keyPoints（字符串数组：3-5条要点，每条不超过60字，按重要性排序）、",
        "keywords（字符串数组：4-8个关键词或术语，每个不超过12字）。",
        "不要输出密码、令牌、Cookie 等敏感内容。",
        `文档标题：${title}`,
        "文档正文（可能已截断）：",
        excerpt,
      ].join("\n"),
    },
  ];
}

export function parseAnalysisJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw createAiError("AI_RESPONSE", "AI 返回内容为空");
  }
  const trimmed = text.trim();
  const normalized = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw createAiError("AI_RESPONSE", "AI 返回内容不是有效 JSON");
  }
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  const summary = typeof source.summary === "string" ? source.summary.trim() : "";
  if (!summary) throw createAiError("AI_RESPONSE", "AI JSON 缺少字段：summary");
  const keyPoints = sanitizeStringList(source.keyPoints, POINT_MAX_CHARS, MAX_KEY_POINTS);
  const keywords = sanitizeStringList(source.keywords, 12, MAX_KEYWORDS);
  if (keyPoints.length === 0) throw createAiError("AI_RESPONSE", "AI JSON 字段必须是非空字符串数组：keyPoints");
  if (keywords.length === 0) throw createAiError("AI_RESPONSE", "AI JSON 字段必须是非空字符串数组：keywords");
  return {
    summary: summary.slice(0, SUMMARY_MAX_CHARS),
    keyPoints,
    keywords,
  };
}

function sanitizeStringList(value, maxItemChars, maxItems) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = String(item ?? "").trim().slice(0, maxItemChars);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

/* ---------------- 本地规则降级 ---------------- */

const CJK_RUN = /[一-鿿㐀-䶿]/;
const STOP_CHARS = new Set(
  "的了是在和有我你他她它这那也不都就与其及或很还啊吗呢吧把被让向着于之为以及等个中下上将可要会能并对从到由但而且所如同比成过时后前内外间一每种么怎什它们我们你们因为所以如果然后通过进行相关对于根据其中以上以下主要之间工作方式时候问题部分".split(""),
);

const STOP_WORDS_EN = new Set([
  "and", "the", "of", "to", "in", "is", "are", "was", "were", "for", "with", "on", "by", "as", "at", "an", "a",
  "that", "this", "these", "those", "it", "its", "be", "or", "not", "from", "into", "their", "they", "we", "you",
  "can", "will", "would", "should", "could", "has", "have", "had", "but", "so", "if", "then", "than", "when", "while",
]);

export function buildLocalAnalysis({ title, text }) {
  const plainText = String(text ?? "");
  const sentences = splitSentences(plainText);
  const keywordScores = scoreKeywords(plainText, title);
  const keywords = [...keywordScores.keys()].slice(0, MAX_KEYWORDS);
  const keyPoints = pickKeyPoints(sentences, keywordScores);
  return { summary: buildSummary(plainText, sentences, keyPoints), keyPoints, keywords };
}

function splitSentences(text) {
  return String(text)
    .replace(/[#>*`\-]{1,}/g, " ")
    .split(/(?<=[。！？!?；;])\s*|[\r\n]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8);
}

/**
 * 关键词评分：CJK 连续串取 2-6 字重叠词计「原始词频」，拉丁词（CPU/Cache/RISC-V 等）整词计频。
 * 只出现一次的长词是句子碎片不算关键词（标题命中除外）；得分 = 词频 × 长度权重 + 标题加权。
 * 选词时按得分排序并做子串去重：完整术语（如「紫晶缓存协议」）会压掉它的碎片。
 */
function scoreKeywords(text, title = "") {
  const freq = new Map();
  const titleHits = new Set();
  const count = (term) => freq.set(term, (freq.get(term) ?? 0) + 1);
  const harvest = (source, onTerm) => {
    for (const match of String(source).matchAll(/[一-鿿㐀-䶿]{2,}|[A-Za-z][A-Za-z0-9+#._-]{1,15}/g)) {
      const run = match[0];
      if (!CJK_RUN.test(run)) {
        if (!/^[-_.#+]/.test(run) && !STOP_WORDS_EN.has(run.toLowerCase())) onTerm(run);
        continue;
      }
      for (let size = 2; size <= 6 && size <= run.length; size += 1) {
        for (let i = 0; i + size <= run.length; i += 1) {
          const ngram = run.slice(i, i + size);
          if (STOP_CHARS.has(ngram[0]) || STOP_CHARS.has(ngram[size - 1])) continue;
          if (size === 2 && (STOP_CHARS.has(run[i]) || STOP_CHARS.has(run[i + 1]))) continue;
          onTerm(ngram);
        }
      }
    }
  };
  harvest(text, count);
  harvest(title, (term) => titleHits.add(term));

  const buildRanked = (minFreq) => {
    const scored = [];
    for (const [term, occurrences] of freq) {
      if (occurrences < minFreq && !titleHits.has(term)) continue;
      const lengthWeight = term.length >= 3 && CJK_RUN.test(term) ? term.length - 0.5 : term.length >= 2 && !CJK_RUN.test(term) ? 1.5 : 1;
      scored.push([term, occurrences * lengthWeight + (titleHits.has(term) ? 3 : 0)]);
    }
    return scored.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], "zh"));
  };

  let ranked = buildRanked(2);
  if (ranked.length < 3) ranked = buildRanked(1); // 文档太短/重复度低时放宽

  const picked = new Map();
  for (const [term, score] of ranked) {
    const duplicate = [...picked.keys()].some((chosen) => chosen.includes(term) || term.includes(chosen));
    if (duplicate) continue;
    picked.set(term, score);
    if (picked.size >= MAX_KEYWORDS) break;
  }
  return picked;
}

function pickKeyPoints(sentences, keywordScores) {
  if (sentences.length === 0) return [];
  const topTerms = [...keywordScores.keys()].slice(0, 6);
  const scored = sentences.map((sentence, index) => {
    let score = 0;
    for (const term of topTerms) {
      if (sentence.includes(term)) score += keywordScores.get(term) ?? 1;
    }
    if (index < 3) score += 2; // 位置加权：开头几句更可能是总起
    return { sentence, index, score };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_KEY_POINTS)
    .sort((a, b) => a.index - b.index) // 恢复原文顺序，读感更自然
    .map(({ sentence }) => (sentence.length > POINT_MAX_CHARS ? `${sentence.slice(0, POINT_MAX_CHARS)}…` : sentence));
}

function buildSummary(text, sentences, keyPoints) {
  const firstParagraph = (String(text).split(/\n\s*\n|\n/).map((p) => p.trim().replace(/^[\s#>*`]+/, "")).filter(Boolean))[0] ?? "";
  let summary = firstParagraph.slice(0, 140);
  if (firstParagraph.length > 140) summary += "…";
  // 首段太短（如标题行）时，补上评分最高的一句，让摘要言之有物
  if (summary.length < 40 && keyPoints.length > 0) {
    const extra = keyPoints.find((point) => !summary.includes(point.slice(0, 20)));
    if (extra) summary = summary ? `${summary} ${extra}` : extra;
  }
  if (!summary.trim() && sentences.length > 0) summary = sentences[0].slice(0, 140);
  return summary.slice(0, SUMMARY_MAX_CHARS);
}
