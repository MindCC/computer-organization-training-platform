/**
 * 知识库（LLMWiki）路由：上传解析 → 分块 → FTS5 索引 → 自动分析 → 检索/列表/详情/删除。
 * 上传机制复用课件上传的模式：express.raw 收二进制 + x-file-name 头传文件名，
 * 鉴权与现有学生端点一致（requireRole("student")）。
 */
import express from "express";
import {
  MAX_KNOWLEDGE_FILE_BYTES,
  normalizeKnowledgeDocumentId,
  normalizeKnowledgeFileBody,
  normalizeKnowledgeSearchQuery,
  normalizeKnowledgeUploadName,
} from "./knowledgeValidation.js";
import { extractTextFromBuffer, chunkText, KnowledgeParseError } from "./knowledgeText.js";
import { analyzeKnowledgeDocument } from "./knowledgeAnalysis.js";
import { buildFtsMatchQuery, createKnowledgeRepository } from "./knowledgeRepository.js";

// 前端统一用 octet-stream 上传（服务端只认扩展名）；同时兼容直传真实 MIME 的调用方。
const UPLOAD_MIME_TYPES = [
  "application/octet-stream",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export function createKnowledgeRouter({ db, requireRole, role='student' }) {
  const router = express.Router();
  const repository = createKnowledgeRepository(db);
  // Teacher materials are owned by their account ID using the same document store.
  const requireOwner = requireRole(role);

  router.post(
    `/${role}/knowledge/upload`,
    requireOwner,
    express.raw({ type: UPLOAD_MIME_TYPES, limit: MAX_KNOWLEDGE_FILE_BYTES }),
    async (req, res, next) => {
      try {
        const nameCheck = normalizeKnowledgeUploadName(req.get("x-file-name"));
        if (!nameCheck.ok) return res.status(nameCheck.status).json({ error: nameCheck.error });
        const bodyCheck = normalizeKnowledgeFileBody(req.body);
        if (!bodyCheck.ok) return res.status(bodyCheck.status).json({ error: bodyCheck.error });

        let extracted;
        try {
          extracted = await extractTextFromBuffer(bodyCheck.buffer, nameCheck.fileType);
        } catch (error) {
          if (error instanceof KnowledgeParseError) {
            return res.status(422).json({ error: `无法解析该文件：${error.message}` });
          }
          throw error;
        }
        const chunks = chunkText(extracted);
        if (chunks.length === 0) {
          return res.status(422).json({ error: "未能从文件中提取到有效文本" });
        }

        const analysis = await analyzeKnowledgeDocument({ title: nameCheck.title, text: extracted.text });
        const document = repository.createDocument({
          studentId: req.user.id,
          title: nameCheck.title,
          originalName: nameCheck.originalName,
          fileType: nameCheck.fileType,
          fileSize: bodyCheck.buffer.length,
          analysis,
          analysisSource: analysis.source,
          chunks,
        });
        res.status(201).json({
          document,
          truncated: extracted.truncated === true,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(`/${role}/knowledge/documents`, requireOwner, (req, res) => {
    res.json({ documents: repository.listDocuments(req.user.id) });
  });

  router.get(`/${role}/knowledge/documents/:id`, requireOwner, (req, res) => {
    const idCheck = normalizeKnowledgeDocumentId(req.params.id);
    if (!idCheck.ok) return res.status(idCheck.status).json({ error: idCheck.error });
    const document = repository.getDocument(req.user.id, idCheck.id);
    if (!document) return res.status(404).json({ error: "文档不存在" });
    res.json({ document });
  });

  router.delete(`/${role}/knowledge/documents/:id`, requireOwner, (req, res) => {
    const idCheck = normalizeKnowledgeDocumentId(req.params.id);
    if (!idCheck.ok) return res.status(idCheck.status).json({ error: idCheck.error });
    if (!repository.deleteDocument(req.user.id, idCheck.id)) {
      return res.status(404).json({ error: "文档不存在" });
    }
    res.json({ ok: true });
  });

  router.get(`/${role}/knowledge/search`, requireOwner, (req, res) => {
    const queryCheck = normalizeKnowledgeSearchQuery(req.query.q);
    if (!queryCheck.ok) return res.status(queryCheck.status).json({ error: queryCheck.error });
    const matchQuery = buildFtsMatchQuery(queryCheck.query);
    const hits = repository.search(req.user.id, matchQuery);
    res.json({ query: queryCheck.query, hits });
  });

  return router;
}
