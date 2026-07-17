import { openDatabase, migrate, createUser, createClass, addStudentToClass } from "../server/db.js";
import { createClassroomSessionRepository } from "../server/classroomSessionRepository.js";
import { createClassroomSessionService } from "../server/classroomSessionService.js";

const STUDENT_COUNT = 150;
const CONCURRENCY = 30;
const TARGET_P95_MS = 2_000;

const db = openDatabase(":memory:");
migrate(db);

const teacher = createUser(db, { username: "load-teacher", displayName: "Load Teacher", role: "teacher", passwordHash: "pw" });
const classRow = createClass(db, teacher.id, "Load Test Class");
const repository = createClassroomSessionRepository(db);
const service = createClassroomSessionService({ db, repository });

// Create students
const students = [];
for (let i = 0; i < STUDENT_COUNT; i++) {
  const username = `load-s${String(i).padStart(4, "0")}`;
  const s = createUser(db, { username, displayName: `学生${i + 1}`, role: "student", passwordHash: "pw" });
  addStudentToClass(db, classRow.id, s.id);
  students.push(s);
}

// Create and start session
const session = service.createDraft({
  teacherId: teacher.id, classId: classRow.id,
  config: { templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80 },
});
service.start({ teacherId: teacher.id, sessionId: session.id });

// Submit from all students with controlled concurrency
const results = [];
const startTime = Date.now();
let running = 0;
const queue = [...students];

function next() {
  if (queue.length === 0) return Promise.resolve();
  const student = queue.shift();
  running++;
  const clientId = `load-cid-${student.id}-${Date.now()}`;
  const payload = {
    clientSubmissionId: clientId,
    challengeId: "computer-components",
    result: { completed: true, elapsedMinutes: 1 },
  };
  const t0 = Date.now();
  return Promise.resolve()
    .then(() => {
      try {
        const result = service.submitAttempt({ studentId: student.id, payload });
        return { ok: true, ms: Date.now() - t0 };
      } catch (err) {
        return { ok: false, ms: Date.now() - t0, error: err.message };
      }
    })
    .then((result) => {
      results.push(result);
      running--;
      return next();
    });
}

// Launch initial batch
const initial = [];
for (let i = 0; i < CONCURRENCY; i++) {
  initial.push(next());
}
await Promise.all(initial);

// Verify results
const totalMs = Date.now() - startTime;
const successCount = results.filter((r) => r.ok).length;
const failCount = results.filter((r) => !r.ok).length;
const times = results.map((r) => r.ms).sort((a, b) => a - b);
const p95Index = Math.ceil(times.length * 0.95) - 1;
const p95 = times[p95Index] ?? 0;
const maxMs = times[times.length - 1] ?? 0;
const sqliteBusyCount = results.filter((r) => r.error?.includes?.("SQLITE_BUSY") ?? false).length;

console.log(`Students: ${STUDENT_COUNT}`);
console.log(`Concurrency: ${CONCURRENCY}`);
console.log(`Total time: ${totalMs} ms`);
console.log(`Success: ${successCount} / ${STUDENT_COUNT}`);
console.log(`Failed: ${failCount}`);
console.log(`SQLITE_BUSY: ${sqliteBusyCount}`);
console.log(`P95: ${p95} ms`);
console.log(`Max: ${maxMs} ms`);

if (failCount > 0) {
  console.error("FAIL: non-zero failure count:", failCount);
  process.exit(1);
}
if (sqliteBusyCount > 0) {
  console.error("FAIL: SQLITE_BUSY detected:", sqliteBusyCount);
  process.exit(1);
}
if (p95 > TARGET_P95_MS) {
  console.error(`FAIL: P95 ${p95} ms exceeds target ${TARGET_P95_MS} ms`);
  process.exit(1);
}

console.log("PASS: 150-student classroom load gate");
db.close();
