/**
 * 教师题库路由：题库浏览/录入/编辑/删除、批量导入（幂等）、
 * 知识库 AI 出题（候选制）、自动出卷（预览或生成班级作业）。
 */
import { Router } from "express";
import { createKnowledgeRepository } from "./knowledgeRepository.js";

export function createQuestionBankRouter({ db, service, requireRole }) {
  const router = Router();
  const teacher = requireRole("teacher");
  const knowledge = createKnowledgeRepository(db);

  router.get("/teacher/question-bank", teacher, (req, res, next) => {
    try {
      res.json(service.list({
        teacherId: req.user.id,
        chapterId: req.query.chapterId, type: req.query.type,
        keyword: req.query.keyword, source: req.query.source,
      }));
    } catch (error) { next(error); }
  });

  router.post("/teacher/question-bank", teacher, (req, res, next) => {
    try {
      res.status(201).json({ question: service.create({ teacherId: req.user.id, input: req.body }) });
    } catch (error) { next(error); }
  });

  router.put("/teacher/question-bank/:id", teacher, (req, res, next) => {
    try {
      res.json({ question: service.update({ teacherId: req.user.id, id: Number(req.params.id), input: req.body }) });
    } catch (error) { next(error); }
  });

  router.delete("/teacher/question-bank/:id", teacher, (req, res, next) => {
    try {
      service.remove({ teacherId: req.user.id, id: Number(req.params.id) });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.post("/teacher/question-bank/import", teacher, (req, res, next) => {
    try {
      const { batchId, source, questions } = req.body ?? {};
      res.json({ result: service.importBatch({ teacherId: req.user.id, batchId, source, questions }) });
    } catch (error) { next(error); }
  });

  // AI 出题：取教师自己的知识库文档摘录作为材料，返回候选题（不写库）
  router.post("/teacher/question-bank/ai-generate", teacher, async (req, res, next) => {
    try {
      const { chapterId, requirements, counts, documentIds, consent } = req.body ?? {};
      const materials = [];
      for (const id of (Array.isArray(documentIds) ? documentIds : []).slice(0, 3)) {
        const document = knowledge.getDocument(req.user.id, Number(id));
        if (!document) continue;
        const text = (document.chunks ?? []).map((chunk) => chunk.content).join("\n").slice(0, 2600);
        if (text) materials.push(`《${document.title}》\n${text}`);
      }
      const result = await service.aiGenerate({
        teacherId: req.user.id, chapterId, requirements, counts, materials, consent,
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  // 自动出卷：action=preview 预览抽题；action=assignment 创建班级作业（可选发布）
  router.post("/teacher/question-bank/compose", teacher, (req, res, next) => {
    try {
      const { classId, title, chapters, spec, seed, action, publish, dueAt } = req.body ?? {};
      res.json(service.compose({ teacherId: req.user.id, classId, title, chapters, spec, seed, action, publish, dueAt }));
    } catch (error) { next(error); }
  });

  return router;
}
