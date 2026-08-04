import { HARDWARE_GAME_CASES } from "../src/hardwareGame.js";
import { LEARNING_ITEMS, summarizeLearning } from "../src/platformLogic.js";
import { buildZip } from "./zipArchive.js";

/**
 * 班级完整成绩包导出（P1-B）。
 * 生成一个 zip，内含：
 *   - scores.csv：逐关成绩汇总（复用 renderScoresCsv 的列结构）
 *   - attempts.json：每个学生的提交记录（含 errors、result_json、时间戳）
 *   - notes.json：学生笔记（按学生 + 关卡组织）
 *   - hardware.json：硬件挑战配置、报价、利润、满意度
 *   - summary.json：班级整体指标
 * 不包含明文密码、session、cookie。
 */

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderScoresCsv(students, learningItems = LEARNING_ITEMS) {
  const header = [
    "学号", "姓名", "完成率", "平均分", "尝试次数",
    ...learningItems.flatMap((challenge) => [
      `${challenge.shortTitle}状态`,
      `${challenge.shortTitle}最高分`,
      `${challenge.shortTitle}尝试次数`,
      `${challenge.shortTitle}耗时`,
    ]),
  ];
  const rows = students.map((student) => [
    student.username,
    student.displayName,
    `${student.summary.completionRate}%`,
    student.summary.averageScore,
    student.summary.totalAttempts,
    ...learningItems.flatMap((challenge) => {
      const record = student.progress[challenge.id];
      return [record?.status, record?.bestScore, record?.attempts, record?.timeSpentMinutes];
    }),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function collectClassAttempts(db, classId) {
  return db.prepare(`
    SELECT
      u.username, u.display_name AS displayName,
      ca.challenge_id AS challengeId, ca.score, ca.passed,
      ca.errors_json AS errorsJson, ca.result_json AS resultJson,
      ca.elapsed_minutes AS elapsedMinutes, ca.created_at AS createdAt
    FROM challenge_attempts ca
    JOIN class_members cm ON cm.student_id = ca.student_id
    JOIN users u ON u.id = ca.student_id
    WHERE cm.class_id = ?
    ORDER BY ca.created_at ASC
  `).all(classId);
}

function collectClassNotes(db, classId) {
  return db.prepare(`
    SELECT
      u.username, u.display_name AS displayName,
      n.title, n.content, n.tag, n.challenge_id AS challengeId,
      n.created_at AS createdAt
    FROM notes n
    JOIN class_members cm ON cm.student_id = n.student_id
    JOIN users u ON u.id = n.student_id
    WHERE cm.class_id = ?
    ORDER BY n.created_at ASC
  `).all(classId);
}

function collectHardwareAttempts(db, classId) {
  return db.prepare(`
    SELECT
      u.username, u.display_name AS displayName,
      ca.challenge_id AS challengeId, ca.score, ca.passed,
      ca.result_json AS resultJson, ca.created_at AS createdAt
    FROM challenge_attempts ca
    JOIN class_members cm ON cm.student_id = ca.student_id
    JOIN users u ON u.id = ca.student_id
    WHERE cm.class_id = ? AND ca.challenge_id LIKE 'game-%'
    ORDER BY ca.created_at ASC
  `).all(classId);
}

function safeJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

/**
 * 构建班级完整成绩包 zip 的字节内容。
 * @param {object} deps { db, classId, className, students, summary }
 * @returns {Buffer}
 */
export function buildClassArchive({ db, classId, className, students, summary }) {
  const attempts = collectClassAttempts(db, classId);
  const notes = collectClassNotes(db, classId);
  const hardwareAttempts = collectHardwareAttempts(db, classId);

  // attempts.json：按学生聚合
  const attemptsByStudent = {};
  for (const row of attempts) {
    const key = row.username;
    attemptsByStudent[key] ??= { username: key, displayName: row.displayName, submissions: [] };
    attemptsByStudent[key].submissions.push({
      challengeId: row.challengeId,
      score: row.score,
      passed: Boolean(row.passed),
      errors: safeJson(row.errorsJson, []),
      result: safeJson(row.resultJson, {}),
      elapsedMinutes: row.elapsedMinutes,
      createdAt: row.createdAt,
    });
  }

  // notes.json：按学生 + 关卡组织
  const notesByStudent = {};
  for (const row of notes) {
    const key = row.username;
    notesByStudent[key] ??= { username: key, displayName: row.displayName, notes: [] };
    notesByStudent[key].notes.push({
      title: row.title,
      content: row.content,
      tag: row.tag,
      challengeId: row.challengeId,
      createdAt: row.createdAt,
    });
  }

  // hardware.json：挑战配置 + 每个学生的提交
  const hardware = {
    cases: HARDWARE_GAME_CASES.map((gameCase) => ({
      id: gameCase.id,
      title: gameCase.title,
      shortTitle: gameCase.shortTitle,
      customer: gameCase.customer,
      targets: gameCase.targets,
    })),
    attempts: hardwareAttempts.map((row) => ({
      username: row.username,
      displayName: row.displayName,
      challengeId: row.challengeId,
      score: row.score,
      passed: Boolean(row.passed),
      result: safeJson(row.resultJson, {}),
      createdAt: row.createdAt,
    })),
  };

  const date = new Date().toISOString().slice(0, 10);
  const safeClassName = String(className ?? `class-${classId}`).replace(/[\\/:*?"<>|]/g, "_");

  return buildZip([
    { name: "scores.csv", content: renderScoresCsv(students) },
    { name: "attempts.json", content: JSON.stringify(Object.values(attemptsByStudent), null, 2) },
    { name: "notes.json", content: JSON.stringify(Object.values(notesByStudent), null, 2) },
    { name: "hardware.json", content: JSON.stringify(hardware, null, 2) },
    { name: "summary.json", content: JSON.stringify(summary, null, 2) },
  ]);
}

export function archiveFileName(className, classId) {
  const date = new Date().toISOString().slice(0, 10);
  const safeClassName = String(className ?? `class-${classId}`).replace(/[\\/:*?"<>|]/g, "_");
  return `${safeClassName}-${date}.zip`;
}

// 供单元测试导出
export { renderScoresCsv, collectClassAttempts, collectClassNotes };
