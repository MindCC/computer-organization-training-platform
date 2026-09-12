import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import express from "express";

const run = promisify(execFile);
const MAX_FILE_BYTES = 30 * 1024 * 1024;

function countSlidesFromPptx(buffer) {
  // PPTX 是 ZIP；文件名会同时出现在本地文件头和中央目录中，用 Set 去重即可。
  const names = buffer.toString("latin1").match(/ppt\/slides\/slide\d+\.xml/g) ?? [];
  return Math.max(1, new Set(names).size);
}

export function createCoursewareUploadRouter({ db, requireRole, dataDirectory = path.resolve("data/courseware") }) {
  const router = express.Router();
  const sourceDirectory = path.join(dataDirectory, "source");
  const outputDirectory = path.join(dataDirectory, "html");
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: true });

  const getUpload = (id) => db.prepare("SELECT * FROM courseware_uploads WHERE id = ?").get(id);
  const isAllowed = (upload, user) => {
    if (!upload) return false;
    if (upload.owner_user_id === user.id) return true;
    if (user.role === "teacher") return upload.class_id != null && db.prepare("SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?").get(upload.class_id, user.id) != null;
    return upload.visibility === "class" && upload.class_id != null && db.prepare("SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?").get(upload.class_id, user.id) != null;
  };

  router.get("/courseware/uploads", requireRole(["teacher", "student"]), (req, res) => {
    const all = db.prepare("SELECT * FROM courseware_uploads ORDER BY id DESC").all()
      .filter((upload) => isAllowed(upload, req.user))
      .map(dto);
    res.json({ uploads: all });
  });

  router.post("/courseware/uploads", requireRole(["teacher", "student"]), express.raw({ type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", limit: MAX_FILE_BYTES }), async (req, res, next) => {
    let uploadedName = String(req.get("x-file-name") ?? "课件.pptx");
    try { uploadedName = decodeURIComponent(uploadedName); } catch { /* keep a safely encoded name */ }
    const originalName = path.basename(uploadedName).slice(0, 180);
    const extension = path.extname(originalName).toLowerCase();
    if (extension !== ".pptx") return res.status(400).json({ error: "第一版仅支持 .pptx 文件" });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "请选择要上传的 PPTX 文件" });
    let classId = Number(req.get("x-class-id")) || null;
    if (req.user.role === "teacher" && !classId) return res.status(400).json({ error: "教师上传课件需选择班级" });
    if (classId && req.user.role === "teacher" && !db.prepare("SELECT 1 FROM classes WHERE id=? AND teacher_id=?").get(classId, req.user.id)) return res.status(403).json({ error: "无权向该班级发布课件" });
    if (req.user.role === "student") {
      const membership = classId
        ? db.prepare("SELECT class_id FROM class_members WHERE class_id=? AND student_id=?").get(classId, req.user.id)
        : db.prepare("SELECT class_id FROM class_members WHERE student_id=? ORDER BY class_id LIMIT 1").get(req.user.id);
      if (!membership) return res.status(classId ? 403 : 400).json({ error: classId ? "你不属于该班级" : "请先加入班级后再上传课件" });
      classId = membership.class_id;
    }
    const storageKey = crypto.randomUUID();
    const slideCount = countSlidesFromPptx(req.body);
    const sourcePath = path.join(sourceDirectory, `${storageKey}.pptx`);
    const renderedDirectory = path.join(outputDirectory, storageKey);
    fs.mkdirSync(renderedDirectory, { recursive: true });
    fs.writeFileSync(sourcePath, req.body, { flag: "wx" });
    const visibility = req.user.role === "teacher" ? "class" : "private";
    const result = db.prepare("INSERT INTO courseware_uploads (owner_user_id,class_id,visibility,original_name,storage_key,slide_count,status) VALUES (?,?,?,?,?,?,?)")
      .run(req.user.id, classId, visibility, originalName, storageKey, slideCount, "processing");
    const id = Number(result.lastInsertRowid);
    try {
      await run(process.env.PPT_CONVERTER ?? "soffice", ["--headless", "--convert-to", "html", "--outdir", renderedDirectory, sourcePath], { timeout: 90_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      const entry = fs.readdirSync(renderedDirectory).find((name) => name.toLowerCase().endsWith(".html"));
      if (!entry) throw new Error("转换器没有生成 HTML 文件");
      db.prepare("UPDATE courseware_uploads SET status='ready', html_entry=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(entry, id);
    } catch (error) {
      db.prepare("UPDATE courseware_uploads SET status='failed', error_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run("PPTX 转换失败：" + error.message.slice(0, 300), id);
    }
    res.status(201).json({ upload: dto(getUpload(id)) });
  });

  router.get("/courseware/uploads/:id/html", requireRole(["teacher", "student"]), (req, res) => {
    const upload = getUpload(Number(req.params.id));
    if (!isAllowed(upload, req.user)) return res.status(404).json({ error: "课件不存在" });
    if (upload.status !== "ready" || !upload.html_entry) return res.status(409).json({ error: upload.error_message ?? "课件仍在转换" });
    const directory = path.join(outputDirectory, upload.storage_key);
    const entryPath = path.join(directory, upload.html_entry);
    if (!entryPath.startsWith(directory) || !fs.existsSync(entryPath)) return res.status(404).json({ error: "转换后的课件文件不存在" });
    let html = fs.readFileSync(entryPath, "utf8");
    html = html.replace(/(src|href)="([^"#:][^"]*)"/g, (_all, attribute, value) => `${attribute}="/api/courseware/uploads/${upload.id}/asset?name=${encodeURIComponent(value)}"`);
    res.type("html").send(html);
  });

  router.get("/courseware/uploads/:id/asset", requireRole(["teacher", "student"]), (req, res) => {
    const upload = getUpload(Number(req.params.id));
    if (!isAllowed(upload, req.user)) return res.status(404).end();
    const name = String(req.query.name ?? "");
    if (!name || path.basename(name) !== name) return res.status(400).end();
    const filePath = path.join(outputDirectory, upload.storage_key, name);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.sendFile(filePath);
  });

  router.get("/courseware/uploads/:id/notes", requireRole(["teacher", "student"]), (req, res) => {
    const upload = getUpload(Number(req.params.id));
    if (!isAllowed(upload, req.user)) return res.status(404).json({ error: "课件不存在" });
    const page = Math.max(1, Number(req.query.page) || 1);
    const notes = db.prepare("SELECT n.id,n.page_number AS pageNumber,n.content,n.visibility,n.created_at AS createdAt,n.author_user_id AS authorUserId,u.display_name AS authorName,u.role AS authorRole FROM courseware_page_notes n JOIN users u ON u.id=n.author_user_id WHERE n.courseware_id=? AND n.page_number=? ORDER BY n.id DESC").all(upload.id, page)
      .filter((note) => note.authorUserId === req.user.id || (note.visibility === "class" && upload.visibility === "class"));
    res.json({ notes });
  });

  router.post("/courseware/uploads/:id/notes", requireRole(["teacher", "student"]), (req, res) => {
    const upload = getUpload(Number(req.params.id));
    if (!isAllowed(upload, req.user)) return res.status(404).json({ error: "课件不存在" });
    const content = String(req.body?.content ?? "").trim();
    if (!content) return res.status(400).json({ error: "笔记内容不能为空" });
    const page = Math.max(1, Number(req.body?.pageNumber) || 1);
    const visibility = req.user.role === "teacher" && upload.visibility === "class" ? "class" : "private";
    const result = db.prepare("INSERT INTO courseware_page_notes (courseware_id,page_number,author_user_id,visibility,content) VALUES (?,?,?,?,?)").run(upload.id, page, req.user.id, visibility, content);
    res.status(201).json({ note: { id: Number(result.lastInsertRowid), pageNumber: page, content, visibility } });
  });

  return router;
}

function dto(row) { return { id: row.id, classId: row.class_id, visibility: row.visibility, originalName: row.original_name, status: row.status, errorMessage: row.error_message, slideCount: row.slide_count, createdAt: row.created_at }; }
