/**
 * 知识库存储层：kb_documents / kb_chunks / kb_index（FTS5 虚表）。
 *
 * 中文索引方案：入库前 tokenizeForIndex 把正文切成「CJK 单字 / 拉丁整词」的空格分隔
 * 序列交给内置 unicode61；检索时把查询同样切分并组 FTS5 短语查询（"缓 存 一 致"），
 * 从而获得子串匹配语义，不依赖 ICU/jieba 等外部扩展。
 * 高亮标记用 \x02 / \x03 控制字符包裹命中词，前端转义后替换成 <mark>，避免 XSS。
 */

const SEARCH_LIMIT = 30;
const SNIPPET_TOKENS = 72;
export const HIGHLIGHT_START = "\x02";
export const HIGHLIGHT_END = "\x03";

/** CJK 逐字成 token；拉丁/数字整词成 token；其余字符一律当分隔符。 */
export function tokenizeForIndex(text) {
  const tokens = [];
  let latin = "";
  const flushLatin = () => {
    if (latin) {
      tokens.push(latin);
      latin = "";
    }
  };
  for (const char of String(text ?? "")) {
    if (/[一-鿿㐀-䶿豈-﫿]/.test(char)) {
      flushLatin();
      tokens.push(char);
    } else if (/[A-Za-z0-9]/.test(char)) {
      latin += char;
    } else if (/[._+#-]/.test(char) && latin) {
      latin += char; // RISC-V / C++ 之类术语内部的连接符保留在词内
    } else {
      flushLatin();
    }
  }
  flushLatin();
  return tokens;
}

/**
 * 把用户查询组为 FTS5 MATCH 表达式：按空白/标点切成词，每个词内部按上面的
 * 规则切成 token 后组短语查询，词与词之间 AND。全部 token 都被引号包裹，
 * 查询里不可能注入 FTS5 语法字符（tokenizer 已丢弃引号等特殊字符）。
 */
export function buildFtsMatchQuery(rawQuery) {
  const words = String(rawQuery ?? "").split(/[^一-鿿㐀-䶿A-Za-z0-9._+#-]+/u).filter(Boolean);
  const phrases = [];
  for (const word of words.slice(0, 6)) {
    const tokens = tokenizeForIndex(word);
    if (tokens.length === 0) continue;
    phrases.push(`"${tokens.join(" ")}"`);
  }
  return phrases.length ? phrases.join(" AND ") : null;
}

export function createKnowledgeRepository(db) {
  const insertDocument = db.prepare(`
    INSERT INTO kb_documents
      (student_id, title, original_name, file_type, file_size, char_count, chunk_count, analysis_json, analysis_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertChunk = db.prepare(`
    INSERT INTO kb_chunks (document_id, student_id, chunk_index, page_no, content)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertIndex = db.prepare(`
    INSERT INTO kb_index (content, chunk_id, document_id, student_id) VALUES (?, ?, ?, ?)
  `);
  const getOwnedDocument = db.prepare(`
    SELECT * FROM kb_documents WHERE id = ? AND student_id = ?
  `);

  function toDocumentDto(row, { withChunks = false } = {}) {
    if (!row) return null;
    const analysis = safeJson(row.analysis_json, {});
    const dto = {
      id: row.id,
      title: row.title,
      originalName: row.original_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      charCount: row.char_count,
      chunkCount: row.chunk_count,
      analysis: {
        summary: typeof analysis.summary === "string" ? analysis.summary : "",
        keyPoints: Array.isArray(analysis.keyPoints) ? analysis.keyPoints : [],
        keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
      },
      analysisSource: row.analysis_source === "ai" ? "ai" : "local",
      fallbackReason: typeof analysis.fallbackReason === "string" ? analysis.fallbackReason : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (withChunks) {
      dto.chunks = db.prepare(`
        SELECT id, chunk_index AS chunkIndex, page_no AS pageNo, content
        FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index ASC
      `).all(row.id);
    }
    return dto;
  }

  return {
    /** 单事务落库：文档 + 分块 + 全文索引，任一失败整体回滚。 */
    createDocument({ studentId, title, originalName, fileType, fileSize, analysis, analysisSource, chunks }) {
      const run = db.transaction(() => {
        const result = insertDocument.run(
          studentId,
          title,
          originalName,
          fileType,
          fileSize,
          chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
          chunks.length,
          JSON.stringify({
            summary: analysis.summary ?? "",
            keyPoints: analysis.keyPoints ?? [],
            keywords: analysis.keywords ?? [],
            ...(analysis.fallbackReason ? { fallbackReason: analysis.fallbackReason } : {}),
          }),
          analysisSource === "ai" ? "ai" : "local",
        );
        const documentId = Number(result.lastInsertRowid);
        for (const chunk of chunks) {
          const chunkResult = insertChunk.run(documentId, studentId, chunk.index, chunk.pageNo ?? null, chunk.content);
          insertIndex.run(tokenizeForIndex(chunk.content).join(" "), Number(chunkResult.lastInsertRowid), documentId, studentId);
        }
        return documentId;
      });
      const documentId = run();
      return toDocumentDto(getOwnedDocument.get(documentId, studentId));
    },

    listDocuments(studentId) {
      return db.prepare(`
        SELECT * FROM kb_documents WHERE student_id = ? ORDER BY id DESC
      `).all(studentId).map((row) => toDocumentDto(row));
    },

    getDocument(studentId, documentId) {
      return toDocumentDto(getOwnedDocument.get(documentId, studentId), { withChunks: true });
    },

    deleteDocument(studentId, documentId) {
      const owned = getOwnedDocument.get(documentId, studentId);
      if (!owned) return false;
      const run = db.transaction(() => {
        db.prepare("DELETE FROM kb_index WHERE document_id = ?").run(documentId);
        db.prepare("DELETE FROM kb_chunks WHERE document_id = ?").run(documentId);
        db.prepare("DELETE FROM kb_documents WHERE id = ?").run(documentId);
      });
      run();
      return true;
    },

    /**
     * 全文检索：FTS5 MATCH + student_id 过滤；返回命中块（含所属文档、
     * 片段高亮标记、关联要点）。query 为空串时由路由层 400，这里收到 null 直接返回空。
     */
    search(studentId, matchQuery, { limit = SEARCH_LIMIT } = {}) {
      if (!matchQuery) return [];
      const rows = db.prepare(`
        SELECT chunk_id AS chunkId, document_id AS documentId, rank,
               snippet(kb_index, 0, char(2), char(3), '…', ${SNIPPET_TOKENS}) AS snippet
        FROM kb_index
        WHERE kb_index MATCH ? AND student_id = ?
        ORDER BY rank
        LIMIT ?
      `).all(matchQuery, studentId, Math.min(Math.max(Number(limit) || SEARCH_LIMIT, 1), 50));
      const chunkStmt = db.prepare("SELECT chunk_index AS chunkIndex, page_no AS pageNo, content FROM kb_chunks WHERE id = ?");
      const docStmt = db.prepare("SELECT title, analysis_json FROM kb_documents WHERE id = ?");
      return rows.map((row) => {
        const chunk = chunkStmt.get(row.chunkId) ?? {};
        const doc = docStmt.get(row.documentId) ?? { title: "未知文档", analysis_json: "{}" };
        const analysis = safeJson(doc.analysis_json, {});
        const keyPoints = Array.isArray(analysis.keyPoints) ? analysis.keyPoints : [];
        return {
          chunkId: row.chunkId,
          documentId: row.documentId,
          documentTitle: doc.title,
          chunkIndex: chunk.chunkIndex ?? 0,
          pageNo: chunk.pageNo ?? null,
          snippet: tightenSnippet(row.snippet ?? ""),
          relatedPoint: pickRelatedPoint(chunk.content ?? "", keyPoints),
        };
      });
    },
  };
}

/** 单字索引会让片段里每个汉字间带空格，这里把 CJK/高亮标记之间的空格收回。 */
function tightenSnippet(snippet) {
  return String(snippet).replace(/([一-鿿㐀-䶿\x02\x03，。！？；：、“”‘’（）《》…])\s+(?=[一-鿿㐀-䶿\x02\x03，。！？；：、“”‘’（）《》…])/g, "$1");
}

/** 命中块与文档要点的关联：共享二元组最多的一条要点；无重叠时取第一条。 */
function pickRelatedPoint(chunkContent, keyPoints) {
  if (!Array.isArray(keyPoints) || keyPoints.length === 0) return null;
  if (!chunkContent) return keyPoints[0];
  const chunkBigrams = new Set();
  for (const match of String(chunkContent).matchAll(/[一-鿿㐀-䶿]{2,}/g)) {
    const run = match[0];
    for (let i = 0; i < run.length - 1; i += 1) chunkBigrams.add(run.slice(i, i + 2));
  }
  let best = keyPoints[0];
  let bestScore = 0;
  for (const point of keyPoints) {
    let score = 0;
    for (const match of String(point).matchAll(/[一-鿿㐀-䶿]{2,}/g)) {
      const run = match[0];
      for (let i = 0; i < run.length - 1; i += 1) {
        if (chunkBigrams.has(run.slice(i, i + 2))) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = point;
    }
  }
  return best;
}

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
