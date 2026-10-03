/**
 * 知识库文档正文提取与分块。
 * TXT/MD 直接读；DOCX 走 mammoth；PDF 走 pdf-parse v2（PDFParse）；PPTX 用 jszip 解压后
 * 从 slide XML 提取 <a:t> 文本。所有解析错误统一抛 KnowledgeParseError，路由层转成
 * 可读的 422 响应，绝不让进程崩溃。
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mammoth = require("mammoth");
const JSZip = require("jszip");
const { PDFParse } = require("pdf-parse");

export const MAX_EXTRACTED_CHARS = 120_000;
export const CHUNK_TARGET_CHARS = 500;
export const CHUNK_MAX_CHARS = 650;

export class KnowledgeParseError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "KnowledgeParseError";
    this.cause = cause;
  }
}

/**
 * 返回 { text, pages }：
 * - text 是规整后的全文（供分析与兜底分块）
 * - pages 为 [{ page, text }]（仅 PDF/PPTX 有页/幻灯片序号，其余为 null）
 */
export async function extractTextFromBuffer(buffer, fileType) {
  switch (fileType) {
    case "txt":
    case "md":
      return finalize(extractPlain(buffer), null);
    case "docx":
      return finalize(await extractDocx(buffer), null);
    case "pdf":
      return extractPdf(buffer);
    case "pptx":
      return extractPptx(buffer);
    default:
      throw new KnowledgeParseError(`不支持的文件类型：${fileType}`);
  }
}

function extractPlain(buffer) {
  // 剥 BOM；大量替换字符说明编码不是 UTF-8，仍尽力返回（不崩）
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

async function extractDocx(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return String(result?.value ?? "");
  } catch (error) {
    throw new KnowledgeParseError(`DOCX 解析失败（文件可能损坏或不是真正的 Word 文档）`, error);
  }
}

async function extractPdf(buffer) {
  let parser = null;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const pages = (result.pages ?? [])
      .map((page) => ({ page: page.num, text: normalizeWhitespace(page.text) }))
      .filter((page) => page.text);
    const text = pages.map((page) => page.text).join("\n\n");
    return finalize(text, pages.length ? pages : null);
  } catch (error) {
    if (error instanceof KnowledgeParseError) throw error;
    throw new KnowledgeParseError("PDF 解析失败（文件可能损坏、已加密或为扫描影印件）", error);
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
}

async function extractPptx(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new KnowledgeParseError("PPTX 解析失败（文件可能损坏或不是真正的 PPT 课件）", error);
  }
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)[1]) - Number(b.match(/slide(\d+)\.xml/i)[1]));
  if (slideNames.length === 0) {
    throw new KnowledgeParseError("PPTX 中没有找到幻灯片内容");
  }
  const pages = [];
  for (let index = 0; index < slideNames.length; index += 1) {
    const xml = await zip.files[slideNames[index]].async("string");
    const runs = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((match) => decodeXmlEntities(match[1]));
    const text = normalizeWhitespace(runs.join(" "));
    if (text) pages.push({ page: index + 1, text });
  }
  const text = pages.map((page) => page.text).join("\n\n");
  return finalize(text, pages.length ? pages : null);
}

function decodeXmlEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_all, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_all, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeWhitespace(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t　]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function finalize(text, pages) {
  let normalized = normalizeWhitespace(text);
  let truncated = false;
  if (normalized.length > MAX_EXTRACTED_CHARS) {
    normalized = normalized.slice(0, MAX_EXTRACTED_CHARS);
    truncated = true;
  }
  if (normalized.length < 10) {
    throw new KnowledgeParseError("未能从文件中提取到足够的正文文本（可能是空文档或纯图片内容）");
  }
  return { text: normalized, pages, truncated };
}

/**
 * 分块：目标 ~500 字/块，上限 650；优先在段落边界切开，超长段落再按句子切。
 * 有页序号（PDF/PPTX）时逐页分块并保留 pageNo；无页文档 pageNo 为 null，
 * chunk_index 即段序号。返回 [{ index, pageNo, content }]。
 */
export function chunkText(extracted) {
  const units = extracted.pages ?? [{ page: null, text: extracted.text }];
  const chunks = [];
  for (const unit of units) {
    for (const piece of splitIntoChunkPieces(unit.text)) {
      chunks.push({ index: chunks.length, pageNo: unit.page, content: piece });
    }
  }
  return chunks;
}

function splitIntoChunkPieces(text) {
  const paragraphs = String(text).split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const pieces = [];
  let current = "";
  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };
  for (const paragraph of paragraphs) {
    // 单段就超过上限：先按句号切，仍超长则硬切
    if (paragraph.length > CHUNK_MAX_CHARS) {
      flush();
      for (const longPiece of splitLongParagraph(paragraph)) pieces.push(longPiece);
      continue;
    }
    if (current && current.length + paragraph.length + 1 > CHUNK_TARGET_CHARS) flush();
    current = current ? `${current}\n${paragraph}` : paragraph;
  }
  flush();
  return pieces;
}

function splitLongParagraph(paragraph) {
  const sentences = paragraph.split(/(?<=[。！？!?；;])/u).map((s) => s.trim()).filter(Boolean);
  const pieces = [];
  let current = "";
  for (const sentence of sentences.length > 1 ? sentences : [paragraph]) {
    if (sentence.length > CHUNK_MAX_CHARS) {
      if (current.trim()) pieces.push(current.trim());
      current = "";
      for (let offset = 0; offset < sentence.length; offset += CHUNK_TARGET_CHARS) {
        pieces.push(sentence.slice(offset, offset + CHUNK_TARGET_CHARS));
      }
      continue;
    }
    if (current && current.length + sentence.length > CHUNK_TARGET_CHARS) {
      pieces.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}
