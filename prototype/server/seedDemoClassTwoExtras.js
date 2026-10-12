import { HOSTED_DEMOS } from "../src/shared/demoNavigation.js";
import { questionsForChapter, gradeQuestion } from "../src/assignmentQuestions.js";
import { COURSE_CHAPTERS } from "../src/courseChapters.js";
import { recordDemoAttempt } from "./db.js";
import { saveAiConversation } from "./aiConversationRepository.js";
import { createApp } from "./app.js";

/**
 * 演示2班的「学情扩展」播种（2026-10-12 用户要求“扩展一下”）。
 *
 * 主播种脚本只写了关卡实验（challenge_attempts / student_progress），学情看板上
 * 其余几块仍是空的：互动演示练习、章节练习、教师作业、小芯答疑、知识库实验进度。
 * 这里把它们补齐，让演示班的每一个统计位置都有真实分布，而不是 0 或空表。
 *
 * 两条硬规矩：
 * 1. 全部走真实写入路径 —— 作业走真实 HTTP 接口（建草稿→加题→发布→提交→判分），
 *    章节练习与演示练习复用服务端自己的判分函数，绝不用手写分数，避免出现
 *    “已通过却 30 分”“判对了却算错”这类自相矛盾的数据。
 * 2. 幂等 —— 所有播进去的数据都带可识别标记，重复执行前先清掉自己上次播的，
 *    真实数据（学生自己产生的记录）一律不动。
 */

const SEED_TAG = "demo2-seed";
const CHAPTER_LADDER = COURSE_CHAPTERS.map((chapter) => chapter.id);

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickWeighted(items, rand) {
  const r = rand();
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight;
    if (r < cumulative) return item;
  }
  return items[items.length - 1];
}

/** 每个演示准备几道真实课程概念的随堂练习（答案与解析由本函数按规则生成）。 */
const DEMO_QUESTIONS = {
  intro: [
    { stem: "冯·诺依曼机中，指令和数据在存储器中的存放方式是？", options: ["分开存放", "同等存放，按地址访问", "指令存在控制器中", "随机存放"], answer: "同等存放，按地址访问", explanation: "存储程序原理要求指令与数据同等存放、按地址访问，靠取指/执行阶段区分。" },
    { stem: "计算机五大部件不包括下列哪一项？", options: ["运算器", "控制器", "总线", "输入设备"], answer: "总线", explanation: "五大部件是运算器、控制器、存储器、输入设备、输出设备；总线是连接部件，不属于五大部件。" },
    { stem: "完成一条指令的取指阶段由哪一部件负责？", options: ["运算器", "控制器", "存储器", "输入设备"], answer: "控制器", explanation: "取指与译码由控制器完成；运算器负责算术与逻辑运算。" },
  ],
  "twos-complement": [
    { stem: "8 位补码能表示的有符号整数范围是？", options: ["-128 ~ 127", "-127 ~ 128", "0 ~ 255", "-255 ~ 255"], answer: "-128 ~ 127", explanation: "8 位补码的表示范围是 −128 ~ +127，负数比正数多一个。" },
    { stem: "已知 X = -5，其 8 位补码是？", options: ["1000 0101", "1111 1011", "1111 1010", "0000 0101"], answer: "1111 1011", explanation: "−5 的原码 1000 0101 → 反码 1111 1010 → 补码 1111 1011。" },
    { stem: "补码减法运算通常转换为？", options: ["加法运算", "乘法运算", "逻辑与运算", "移位运算"], answer: "加法运算", explanation: "补码把减法统一为加负数补码，即 [X−Y]补 = [X]补 + [−Y]补。" },
  ],
  "arithmetic-basics": [
    { stem: "补码算术右移一位后，符号位如何变化？", options: ["补 0", "补符号位", "取反", "随机"], answer: "补符号位", explanation: "补码算术右移保持符号位不变、右移时补符号位数值。" },
    { stem: "原码算术左移时，哪一位保持不变？", options: ["符号位", "最低位", "次高位", "全部变化"], answer: "符号位", explanation: "原码移位时符号位固定，只对数值部分移位并补 0。" },
  ],
  alu: [
    { stem: "原码一位乘法中，每次相加的依据是？", options: ["乘数当前位", "被乘数符号", "部分积符号", "进位标志"], answer: "乘数当前位", explanation: "原码一位乘法逐位判断乘数当前位，为 1 则加被乘数，为 0 则加 0。" },
    { stem: "浮点数加减运算的第一步是？", options: ["对阶", "规格化", "舍入", "溢出判断"], answer: "对阶", explanation: "浮点加减按对阶 → 尾数运算 → 规格化 → 舍入 → 溢出判断的顺序进行。" },
  ],
  "adder-alu": [
    { stem: "全加器的两个输出分别是？", options: ["和 S 与进位 Cout", "差与借位", "积与进位", "商与余数"], answer: "和 S 与进位 Cout", explanation: "全加器实现 S = A ⊕ B ⊕ Cin，Cout 由三输入多数表决得到。" },
    { stem: "半加器与全加器的主要区别是？", options: ["是否考虑低位进位", "门的数量", "输入位数", "输出电压"], answer: "是否考虑低位进位", explanation: "半加器只处理两个输入位；全加器额外接收低位进位 Cin。" },
  ],
  "memory-system": [
    { stem: "Cache 与主存之间的映射方式不包括？", options: ["直接映射", "全相联映射", "组相联映射", "随机映射"], answer: "随机映射", explanation: "常用映射方式是直接映射、全相联映射和组相联映射三种。" },
    { stem: "平均访问时间 AMAT 的计算与哪一项有关？", options: ["命中率与缺失代价", "总线宽度", "指令条数", "时钟周期数"], answer: "命中率与缺失代价", explanation: "AMAT = 命中时间 + 缺失率 × 缺失代价。" },
  ],
  addressing: [
    { stem: "指令中直接给出操作数地址的寻址方式是？", options: ["立即寻址", "直接寻址", "间接寻址", "寄存器寻址"], answer: "直接寻址", explanation: "直接寻址的地址码字段就是操作数的有效地址。" },
    { stem: "操作数就存放在指令中的寻址方式是？", options: ["立即寻址", "直接寻址", "变址寻址", "相对寻址"], answer: "立即寻址", explanation: "立即寻址的地址码字段即为操作数本身，取指后即可使用。" },
  ],
  cpu: [
    { stem: "流水线提高的是指令执行的？", options: ["吞吐率", "单条延迟", "功耗", "字长"], answer: "吞吐率", explanation: "流水线让多条指令重叠执行，提高单位时间完成的指令数即吞吐率。" },
    { stem: "数据冒险通常可以通过什么手段缓解？", options: ["数据旁路", "提高主频", "增加字长", "扩大 Cache"], answer: "数据旁路", explanation: "数据旁路（转发）把结果提前送给后续指令，减少流水线停顿。" },
  ],
  bus: [
    { stem: "系统总线通常不包括？", options: ["数据总线", "地址总线", "控制总线", "电源总线"], answer: "电源总线", explanation: "系统总线按功能分为数据总线、地址总线和控制总线三类。" },
    { stem: "总线带宽的单位通常是？", options: ["字节/秒", "位", "赫兹", "周期"], answer: "字节/秒", explanation: "总线带宽表示单位时间传输的数据量，常用 MB/s。" },
  ],
  io: [
    { stem: "不需要 CPU 逐字干预的传送方式是？", options: ["程序查询", "中断方式", "DMA 方式", "程序控制"], answer: "DMA 方式", explanation: "DMA 由控制器直接在主存与外设间传送数据，仅在结束时打断 CPU。" },
    { stem: "中断服务程序的入口地址通常来自？", options: ["中断向量表", "程序计数器", "指令寄存器", "栈指针"], answer: "中断向量表", explanation: "CPU 按中断类型号查中断向量表取得服务程序入口地址。" },
  ],
};

/** 小芯答疑里会出现的问题（带课程范围，避免写入超纲内容）。 */
const ASK_TEMPLATES = [
  { chapterId: "ch2", question: "为什么补码能把减法变成加法？" },
  { chapterId: "ch2", question: "8 位补码为什么负数比正数多一个？" },
  { chapterId: "ch3", question: "全加器的进位输出是怎么算出来的？" },
  { chapterId: "ch4", question: "直接映射和组相联映射应该怎么选？" },
  { chapterId: "ch6", question: "流水线里的数据冒险怎么解决？" },
  { chapterId: "ch1", question: "冯·诺依曼结构的瓶颈在哪里？" },
  { chapterId: "ch7", question: "总线带宽和时钟频率是什么关系？" },
  { chapterId: "ch8", question: "DMA 和中断方式有什么区别？" },
];

function demoQuestionsFor(demoId, rand) {
  const pool = DEMO_QUESTIONS[demoId] ?? [];
  if (!pool.length) return { total: 0, correct: 0, questions: [] };
  const take = pool.slice(0, pool.length);
  const questions = take.map((item) => {
    const correct = rand() < 0.78;
    const wrongOptions = (item.options ?? []).filter((option) => option !== item.answer);
    const studentAnswer = correct
      ? item.answer
      : (wrongOptions[Math.floor(rand() * wrongOptions.length)] ?? "未作答");
    return {
      id: `${SEED_TAG}-${demoId}`,
      stem: item.stem,
      options: item.options ?? [],
      studentAnswer,
      referenceAnswer: item.answer,
      explanation: item.explanation,
      correct,
    };
  });
  const correct = questions.filter((question) => question.correct).length;
  return { total: questions.length * 10, correct: correct * 10, questions };
}

/**
 * 清掉本播种器上次写入的扩展数据（幂等），真实记录不动。
 * 识别依据：演示练习的题目 id 前缀、章节练习的提交标识前缀、答疑的问题原文。
 */
export function clearSeededExtras(db, studentIds) {
  if (!studentIds.length) return { demoAttempts: 0, practiceAttempts: 0, conversations: 0 };
  const marks = studentIds.map(() => "?").join(",");
  const demoAttempts = db.prepare(`DELETE FROM demo_attempts WHERE student_id IN (${marks}) AND questions_json LIKE ?`).run(...studentIds, `%${SEED_TAG}%`).changes;
  const practiceAttempts = db.prepare(`DELETE FROM chapter_practice_attempts WHERE student_id IN (${marks}) AND client_submission_id LIKE ?`).run(...studentIds, `${SEED_TAG}%`).changes;
  const questions = ASK_TEMPLATES.map(() => "?").join(",");
  const conversations = db.prepare(`DELETE FROM ai_conversations WHERE student_id IN (${marks}) AND question IN (${questions})`).run(...studentIds, ...ASK_TEMPLATES.map((item) => item.question)).changes;
  return { demoAttempts, practiceAttempts, conversations };
}

/** 互动演示随堂练习：哪一档学生用哪个演示，按画像分布，保证完成数与正确率都有差异。 */
export function seedDemoAttempts(db, studentRows, rand) {
  const profiles = [
    { weight: 0.25, demos: 8, accuracy: 0.95 },
    { weight: 0.3, demos: 6, accuracy: 0.85 },
    { weight: 0.25, demos: 4, accuracy: 0.7 },
    { weight: 0.2, demos: 2, accuracy: 0.55 },
  ];
  let created = 0;
  for (const student of studentRows) {
    const profile = pickWeighted(profiles, rand);
    const demos = HOSTED_DEMOS.slice(0, profile.demos);
    for (const [index, demo] of demos.entries()) {
      const result = demoQuestionsFor(demo.id, rand);
      if (!result.questions.length) continue;
      // 按画像的目标正确率决定前几题对、其余错，保证完成数与正确率都有真实差异
      const targetCorrect = Math.round(result.questions.length * profile.accuracy);
      result.questions.forEach((question, questionIndex) => {
        question.correct = questionIndex < targetCorrect;
        if (question.correct) {
          question.studentAnswer = question.referenceAnswer;
        } else {
          const wrong = (question.options ?? []).filter((option) => option !== question.referenceAnswer);
          question.studentAnswer = wrong[Math.floor(rand() * wrong.length)] ?? "未作答";
        }
      });
      const correct = result.questions.filter((question) => question.correct).length;
      const ok = recordDemoAttempt(db, student.id, demo.id, {
        score: correct * 10,
        total: result.questions.length * 10,
        correct: correct * 10,
        errors: result.questions.filter((question) => !question.correct).map((question) => ({ type: "演示随堂练习", message: question.stem })),
        elapsedMinutes: Math.round(4 + rand() * 20),
        questions: result.questions,
      }, `${SEED_TAG}-${demo.id}-${index}-${student.id}`);
      if (ok) created += 1;
    }
  }
  return created;
}

/** 章节练习：复用服务端判分函数，答案对错与画像一致。 */
export function seedChapterPractice(db, studentRows, rand) {
  const profiles = [
    { weight: 0.25, chapters: 6, accuracy: 0.9 },
    { weight: 0.3, chapters: 5, accuracy: 0.8 },
    { weight: 0.25, chapters: 3, accuracy: 0.65 },
    { weight: 0.2, chapters: 2, accuracy: 0.5 },
  ];
  let created = 0;
  for (const student of studentRows) {
    const profile = pickWeighted(profiles, rand);
    for (const chapterId of CHAPTER_LADDER.slice(0, profile.chapters)) {
      const questions = questionsForChapter(chapterId);
      if (!questions.length) continue;
      const answers = {};
      const results = {};
      for (const question of questions) {
        const correct = rand() < profile.accuracy;
        let value;
        if (correct) {
          value = question.options ? String(question.answer) : String(question.answer ?? "");
        } else if (question.options?.length) {
          const wrong = question.options.filter((option) => String(option) !== String(question.answer));
          value = String(wrong[Math.floor(rand() * wrong.length)] ?? "");
        } else {
          value = "记不清了";
        }
        answers[question.id] = value;
        results[question.id] = gradeQuestion(question, value);
      }
      db.prepare("INSERT INTO chapter_practice_attempts (student_id, chapter_id, client_submission_id, answers_json, results_json, created_at) VALUES (?,?,?,?,?,?)")
        .run(student.id, chapterId, `${SEED_TAG}-practice-${chapterId}-${student.id}`, JSON.stringify(answers), JSON.stringify(results), new Date().toISOString());
      created += 1;
    }
  }
  return created;
}

/** 小芯答疑：写入问答记录与提问分布，教师端才能看到“求助知识点 Top N”。 */
export function seedAiConversations(db, studentRows, rand) {
  const profiles = [
    { weight: 0.3, asks: 5 },
    { weight: 0.35, asks: 3 },
    { weight: 0.2, asks: 2 },
    { weight: 0.15, asks: 0 },
  ];
  let created = 0;
  for (const student of studentRows) {
    const profile = pickWeighted(profiles, rand);
    const pool = [...ASK_TEMPLATES].sort(() => rand() - 0.5).slice(0, profile.asks);
    for (const item of pool) {
      saveAiConversation(db, {
        studentId: student.id,
        kind: "question",
        question: item.question,
        answer: {
          source: rand() < 0.75 ? "ai" : "local",
          explanation: `结合《${COURSE_CHAPTERS.find((chapter) => chapter.id === item.chapterId)?.title ?? item.chapterId}》的公开课程内容作答。`,
          steps: ["先定位所属章节概念。", "再对照实验或演示中的现象。"],
          check: "你能用自己的话说清这一步的输入与输出吗？",
        },
        context: { chapterId: item.chapterId },
      });
      created += 1;
    }
  }
  return created;
}

/**
 * 教师作业：走真实 HTTP 接口完成“建草稿 → 加题 → 发布 → 学生提交 → 教师判分”，
 * 这样作业状态、总分、逐题得分、教师反馈都符合业务规则。
 */
export async function seedAssignments({ db, classId, studentRows, teacherPassword = "Demo123!", studentPassword = "Student123!" }) {
  const app = createApp({ db, serveStatic: false, logger: () => {}, assistantOptions: { env: {} } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const jars = new Map();
  async function request(path, { method = "GET", body, jarName = "teacher" } = {}) {
    const jar = jars.get(jarName) ?? {};
    const response = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(jar.cookie ? { cookie: jar.cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) jar.cookie = setCookie.split(";")[0];
    jars.set(jarName, jar);
    const type = response.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await response.json() : await response.text();
    return { status: response.status, data };
  }

  const summary = { assignmentId: null, published: false, submitted: 0, graded: 0, skipped: 0, reasons: [] };
  try {
    const login = await request("/api/auth/login", { method: "POST", body: { username: "demo-teacher", password: teacherPassword } });
    if (login.status !== 200) throw new Error(`演示教师登录失败（${login.status}）：${login.data?.error ?? ""}`);

    const created = await request(`/api/teacher/classes/${classId}/assignments`, { method: "POST", body: { title: "第二章 补码运算 · 课后作业" } });
    if (created.status !== 201) throw new Error(`建作业草稿失败（${created.status}）：${created.data?.error ?? ""}`);
    const assignmentId = created.data.assignment.id;
    summary.assignmentId = assignmentId;

    const refs = ["ch2-q01", "ch2-q02", "ch2-q03", "ch2-q05", "ch2-q08"].map((id) => ({ source: "builtin", id }));
    const added = await request(`/api/teacher/assignments/${assignmentId}/question-bank`, { method: "POST", body: { questions: refs } });
    if (added.status !== 201) throw new Error(`加入题目失败（${added.status}）：${added.data?.error ?? ""}`);

    const published = await request(`/api/teacher/assignments/${assignmentId}/publish`, { method: "POST", body: {} });
    if (published.status !== 200) throw new Error(`发布作业失败（${published.status}）：${published.data?.error ?? ""}`);
    summary.published = true;

    const detail = await request(`/api/teacher/assignments/${assignmentId}`);
    // getTeacherAssignmentDetail 是平铺返回：{ ...assignment, questions }
    const questions = detail.data?.questions ?? [];
    if (!questions.length) throw new Error("发布后读不到作业题目");

    const rand = seededRandom(20261013);
    for (const [index, student] of studentRows.entries()) {
      // 让提交有分布：一部分已判分、一部分已提交待判、少数未提交
      const mode = index % 5 === 4 ? "none" : index % 3 === 0 ? "graded" : "submitted";
      if (mode === "none") { summary.skipped += 1; continue; }
      const jarName = `student-${student.id}`;
      const studentLogin = await request("/api/auth/login", { method: "POST", jarName, body: { username: student.username, password: studentPassword } });
      if (studentLogin.status !== 200) { summary.skipped += 1; summary.reasons.push(`login ${student.username}=${studentLogin.status}`); continue; }

      const answers = questions.map((question) => {
        const correct = rand() < 0.75;
        const options = (() => { try { return JSON.parse(question.options_json ?? "[]"); } catch { return []; } })();
        let value = "";
        try { value = JSON.parse(question.answer_json ?? '""'); } catch { value = String(question.answer_json ?? ""); }
        if (!correct && Array.isArray(options) && options.length) {
          const wrong = options.filter((option) => String(option) !== String(value));
          value = wrong[Math.floor(rand() * wrong.length)] ?? "";
        } else if (!correct) {
          value = "记不清了";
        }
        return { questionId: question.id, answer: value };
      });

      const draft = await request(`/api/student/assignments/${assignmentId}/draft`, { method: "POST", jarName, body: { answers } });
      if (draft.status !== 200 && draft.status !== 201) { summary.skipped += 1; summary.reasons.push(`draft ${student.username}=${draft.status}:${JSON.stringify(draft.data).slice(0, 120)}`); continue; }
      const submitted = await request(`/api/student/assignments/${assignmentId}/submit`, { method: "POST", jarName, body: { answers } });
      if (submitted.status !== 200 && submitted.status !== 201) { summary.skipped += 1; summary.reasons.push(`submit ${student.username}=${submitted.status}:${JSON.stringify(submitted.data).slice(0, 120)}`); continue; }
      summary.submitted += 1;

      if (mode === "graded") {
        const submissions = await request(`/api/teacher/assignments/${assignmentId}/submissions`);
        const target = (submissions.data?.submissions ?? []).find((row) => row.student_id === student.id);
        if (!target) continue;
        const questionScores = questions.map((question) => {
          const studentAnswer = answers.find((answer) => answer.questionId === question.id)?.answer;
          let reference = question.answer_json ?? "";
          try { reference = JSON.parse(question.answer_json ?? '""'); } catch { /* 保持原样 */ }
          const isCorrect = String(studentAnswer).trim() === String(reference).trim();
          return { questionId: question.id, score: isCorrect ? Number(question.score ?? 10) : 0 };
        });
        const graded = await request(`/api/teacher/submissions/${target.id}/grade`, { method: "POST", body: { questionScores, feedback: "注意补码与反码的转换步骤，错题请对照解析重做一遍。" } });
        if (graded.status === 200) summary.graded += 1;
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  return summary;
}
