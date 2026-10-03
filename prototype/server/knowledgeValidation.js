/**
 * 知识库（LLMWiki）服务端校验：上传文件名/类型、检索词、文档 id。
 * 风格对齐 demoValidation.js：返回 { ok, status?, error? } 判别联合，路由层只做分发。
 */

export const KNOWLEDGE_FILE_TYPES = Object.freeze([
  { ext: ".txt", fileType: "txt", label: "TXT 文本" },
  { ext: ".md", fileType: "md", label: "Markdown" },
  { ext: ".docx", fileType: "docx", label: "Word 文档" },
  { ext: ".pdf", fileType: "pdf", label: "PDF 文档" },
  { ext: ".pptx", fileType: "pptx", label: "PPT 课件" },
]);

const EXTENSIONS = new Map(KNOWLEDGE_FILE_TYPES.map((item) => [item.ext, item]));

export const MAX_KNOWLEDGE_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_KNOWLEDGE_NAME_LENGTH = 180;
export const MAX_KNOWLEDGE_QUERY_LENGTH = 60;
export const MAX_KNOWLEDGE_TITLE_LENGTH = 80;

/** 知识库上传只认扩展名（Content-Type 一律是 octet-stream，由前端统一设置）。 */
export function normalizeKnowledgeUploadName(rawName) {
  let name = String(rawName ?? "");
  try {
    name = decodeURIComponent(name);
  } catch {
    // 保留未解码的名字，后续 basename 仍能兜底
  }
  // 剥掉路径，只留文件名；同时挡住控制字符
  name = name.replace(/[\\/]/g, "_").replace(/[\x00-\x1f]/g, "").trim();
  if (!name) return { ok: false, status: 400, error: "缺少文件名" };
  if (name.length > MAX_KNOWLEDGE_NAME_LENGTH) {
    return { ok: false, status: 400, error: `文件名过长（上限 ${MAX_KNOWLEDGE_NAME_LENGTH} 字符）` };
  }
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  const matched = EXTENSIONS.get(ext);
  if (!matched) {
    return { ok: false, status: 400, error: "仅支持 TXT / MD / DOCX / PDF / PPTX 文件" };
  }
  const baseName = name.slice(0, name.length - matched.ext.length).trim();
  const title = (baseName || "未命名文档").slice(0, MAX_KNOWLEDGE_TITLE_LENGTH);
  return { ok: true, originalName: name, fileType: matched.fileType, title };
}

export function normalizeKnowledgeFileBody(body) {
  const buffer = Buffer.isBuffer(body)
    ? body
    : typeof body === "string" && body
      ? Buffer.from(body, "utf8")
      : null;
  if (!buffer || buffer.length === 0) {
    return { ok: false, status: 400, error: "请选择要上传的文件" };
  }
  if (buffer.length > MAX_KNOWLEDGE_FILE_BYTES) {
    return { ok: false, status: 400, error: `文件超过 ${Math.round(MAX_KNOWLEDGE_FILE_BYTES / 1024 / 1024)}MB 上限` };
  }
  return { ok: true, buffer };
}

export function normalizeKnowledgeSearchQuery(raw) {
  const query = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!query) return { ok: false, status: 400, error: "请输入检索关键词" };
  if (query.length > MAX_KNOWLEDGE_QUERY_LENGTH) {
    return { ok: false, status: 400, error: `检索词过长（上限 ${MAX_KNOWLEDGE_QUERY_LENGTH} 字符）` };
  }
  return { ok: true, query };
}

export function normalizeKnowledgeDocumentId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, error: "文档标识无效" };
  }
  return { ok: true, id };
}
