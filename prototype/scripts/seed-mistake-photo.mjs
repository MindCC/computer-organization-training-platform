/**
 * 浏览器 QA 种子：为 verify-mistake-photo.mjs 准备一名学生和两条已归档的拍照错题。
 * 识别链路本身由 server/photoMistakes.test.mjs 的 mock 覆盖，这里只铺 UI 需要的数据。
 * 幂等：重复执行不会重复建账或插入错题。
 */
import { openDatabase, migrate, createUser } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { createImport, archiveImport, replaceImportMistakes } from '../server/photoMistakeRepository.js';

export const QA_PHOTO_STUDENT = { username: 'qa-photo-student', password: 'PhotoQa123!' };

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export async function seedMistakePhoto(db) {
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(QA_PHOTO_STUDENT.username);
  let studentId = existing?.id;
  if (!studentId) {
    studentId = createUser(db, {
      username: QA_PHOTO_STUDENT.username, role: 'student', displayName: '拍照 QA 学生',
      passwordHash: await hashPassword(QA_PHOTO_STUDENT.password),
    }).id;
  }
  const already = db.prepare("SELECT id FROM photo_imports WHERE student_id = ? AND client_submission_id = 'qa-photo-seed-0001'").get(studentId);
  if (already) return { studentId, importId: already.id };
  const created = createImport(db, { studentId, clientSubmissionId: 'qa-photo-seed-0001', images: [PNG_1PX], provider: 'qa-seed' });
  replaceImportMistakes(db, {
    studentId,
    importId: created.id,
    questions: [
      {
        imageIndex: 0, chapterId: 'ch2', kpId: 'concept-twos-complement', knowledgeLabel: '补码表示与转换', qtype: 'fill',
        stem: '8 位补码 10010110 对应的真值是多少？', studentAnswer: '-22', referenceAnswer: '-106',
        explanation: '把符号位当作普通数值位参与求和。', options: [], box: { x: 0.05, y: 0.1, w: 0.9, h: 0.35 },
      },
      {
        imageIndex: 0, chapterId: 'ch3', kpId: null, knowledgeLabel: '全加器', qtype: 'choice',
        stem: '半加器的进位输出是？', studentAnswer: 'A⊕B', referenceAnswer: 'A·B',
        explanation: '', options: ['A·B', 'A⊕B', 'A+B', 'A̅⊕B̅'], box: null,
      },
    ],
  });
  archiveImport(db, studentId, created.id);
  return { studentId, importId: created.id };
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}` || process.argv[1]?.endsWith('seed-mistake-photo.mjs')) {
  const db = openDatabase(process.env.DATABASE_PATH);
  migrate(db);
  const result = await seedMistakePhoto(db);
  console.log(`Mistake photo seed ready: student=${result.studentId} import=${result.importId}`);
  db.close();
}
