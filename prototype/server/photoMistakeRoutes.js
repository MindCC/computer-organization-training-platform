import { Router, json } from 'express';
import {
  photoCapabilities, createPhotoImport, getImportDetail, updateImportQuestions, archivePhotoImport,
  explainPhotoMistake, generateSimilarRound, listMistakeRounds, answerSimilarRound,
  setPhotoMastered, deletePhotoMistake, photoError, listPhotoImportDrafts,
} from './photoMistakes.js';
import { getImportImage, getImportRow } from './photoMistakeRepository.js';

/**
 * 拍照导入错题路由。学生与教师（教师试练）各挂一份，路径以角色为前缀。
 * 注意：创建导入携带 base64 照片，需要大 body 解析；app.js 的全局 1mb 解析器会跳过这些路径。
 */
export function createPhotoMistakeRouter({ db, requireRole, role = 'student', env }) {
  const router = Router();
  const options = { env: env ?? process.env };
  const wrap = (handler) => async (req, res, next) => {
    try { await handler(req, res); } catch (error) { next(error.status ? error : error); }
  };

  router.get(`/${role}/photo-mistakes/capabilities`, requireRole(role), (req, res) => {
    res.json(photoCapabilities(options.env));
  });

  router.post(`/${role}/photo-imports`, json({ limit: '30mb' }), requireRole(role), wrap(async (req, res) => {
    const { images, consent, clientSubmissionId } = req.body ?? {};
    const result = await createPhotoImport(db, req.user.id, { images, consent, clientSubmissionId }, options);
    res.status(result.duplicated ? 200 : 201).json(getImportDetail(db, req.user.id, result.importId));
  }));

  router.get(`/${role}/photo-imports/:id`, requireRole(role), wrap(async (req, res) => {
    res.json(getImportDetail(db, req.user.id, req.params.id));
  }));

  router.get(`/${role}/photo-imports`, requireRole(role), (req, res) => {
    res.set('cache-control', 'no-store').json(listPhotoImportDrafts(db, req.user.id));
  });

  router.put(`/${role}/photo-imports/:id/questions`, requireRole(role), json({ limit: '1mb' }), wrap(async (req, res) => {
    res.json(updateImportQuestions(db, req.user.id, req.params.id, req.body?.questions));
  }));

  router.post(`/${role}/photo-imports/:id/archive`, requireRole(role), wrap(async (req, res) => {
    res.json(archivePhotoImport(db, req.user.id, req.params.id));
  }));

  // 导入照片按属主鉴权回读（错题卡片裁剪展示用），不设置公开缓存。
  router.get(`/${role}/photo-imports/:id/image/:index`, requireRole(role), wrap(async (req, res) => {
    const id = Number(req.params.id);
    const index = Number(req.params.index);
    if (!Number.isInteger(id) || !Number.isInteger(index)) throw photoError(400, '图片标识无效');
    if (!getImportRow(db, req.user.id, id)) throw photoError(404, '导入不存在');
    const dataUrl = getImportImage(db, req.user.id, id, index);
    if (!dataUrl) throw photoError(404, '图片不存在');
    const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl);
    if (!match) throw photoError(500, '图片数据损坏');
    res.set({ 'content-type': `image/${match[1]}`, 'cache-control': 'private, max-age=3600' });
    res.send(Buffer.from(match[2], 'base64'));
  }));

  router.post(`/${role}/photo-mistakes/:id/explain`, requireRole(role), wrap(async (req, res) => {
    res.json(await explainPhotoMistake(db, req.user.id, req.params.id, { consent: req.body?.consent }, options));
  }));

  router.post(`/${role}/photo-mistakes/:id/similar`, requireRole(role), wrap(async (req, res) => {
    const { consent, clientSubmissionId } = req.body ?? {};
    const result = await generateSimilarRound(db, req.user.id, req.params.id, { consent, clientSubmissionId }, options);
    res.status(result.duplicated ? 200 : 201).json(result);
  }));

  router.get(`/${role}/photo-mistakes/:id/rounds`, requireRole(role), wrap(async (req, res) => {
    res.json(listMistakeRounds(db, req.user.id, req.params.id));
  }));

  router.post(`/${role}/photo-rounds/:roundId/answers`, requireRole(role), wrap(async (req, res) => {
    const { answers, selfAssessments, aiJudgeConsent } = req.body ?? {};
    res.json(await answerSimilarRound(db, req.user.id, req.params.roundId, { answers, selfAssessments, aiJudgeConsent }, options));
  }));

  router.post(`/${role}/photo-mistakes/:id/mastered`, requireRole(role), wrap(async (req, res) => {
    res.json({ mistake: setPhotoMastered(db, req.user.id, req.params.id, req.body?.mastered) });
  }));

  router.delete(`/${role}/photo-mistakes/:id`, requireRole(role), wrap(async (req, res) => {
    deletePhotoMistake(db, req.user.id, req.params.id);
    res.json({ ok: true });
  }));

  return router;
}
