import test from "node:test";
import assert from "node:assert/strict";

import { COURSE_CHAPTERS } from "./courseChapters.js";
import { KNOWLEDGE_POINTS } from "./knowledgePoints.js";
import {
  ASSIGNMENT_QUESTIONS,
  chapterQuestionLimit,
  chapterMasteryOf,
  gradeChapterQuestions,
  gradeQuestion,
  normalizeAnswerText,
  questionOf,
  questionsForChapter,
  questionsForKp,
  validateQuestionBank,
} from "./assignmentQuestions.js";

test("题库结构合法：按章知识点调整题量、答案合法、每个知识点都有题", () => {
  assert.deepEqual(validateQuestionBank(), []);
  for (const chapter of COURSE_CHAPTERS) {
    const questions = questionsForChapter(chapter.id);
    assert.ok(questions.length >= 5 && questions.length <= chapterQuestionLimit(chapter.id), `${chapter.id} 题量 ${questions.length}`);
    const types = new Set(questions.map((question) => question.type));
    assert.ok(types.size >= 2, `${chapter.id} 题型要混合`);
  }
  for (const kp of KNOWLEDGE_POINTS) {
    assert.ok(questionsForKp(kp.id).length > 0, `${kp.id} 至少一道题`);
  }
});

test("单选判分：答对满分、答错 0 分、未答 0 分", () => {
  const question = questionOf("ch3-q01"); // 与门 A=1 B=0 → 0
  assert.equal(question.answer, "0");
  assert.deepEqual(gradeQuestion(question, "0"), { correct: true, earned: 10, max: 10, matchedGroups: 1, totalGroups: 1 });
  assert.deepEqual(gradeQuestion(question, "1"), { correct: false, earned: 0, max: 10, matchedGroups: 0, totalGroups: 1 });
  assert.equal(gradeQuestion(question, "").earned, 0);
  assert.equal(gradeQuestion(question, undefined).earned, 0);
});

test("判断判分：true/false 精确比对", () => {
  const question = questionOf("ch3-q03"); // 异或门相同输出 1 → 错误
  assert.equal(question.answer, "false");
  assert.equal(gradeQuestion(question, "false").correct, true);
  assert.equal(gradeQuestion(question, "true").correct, false);
});

test("填空判分：关键词组命中、同义词与大小写/空格归一", () => {
  const mar = questionOf("ch4-q05"); // MAR + MDR 两空
  assert.equal(gradeQuestion(mar, "MAR 和 MDR").correct, true);
  assert.equal(gradeQuestion(mar, "mar、mdr").correct, true, "小写也算对");
  assert.equal(gradeQuestion(mar, "先送 MAR，再读出到 MDR").correct, true, "包含关键词即可");
  const half = gradeQuestion(mar, "MAR");
  assert.equal(half.correct, false);
  assert.equal(half.matchedGroups, 1);
  assert.equal(half.earned, Math.round((mar.score * 1) / 2), "多空题按命中组数比例给分");
  assert.equal(gradeQuestion(mar, "不知道").earned, 0);

  const synonyms = questionOf("ch5-q06"); // 形式地址/偏移量/位移量 同义词
  assert.equal(gradeQuestion(synonyms, "偏移量").correct, true);
  assert.equal(gradeQuestion(synonyms, "形式地址").correct, true);
  assert.equal(gradeQuestion(synonyms, "位移量").correct, true);
});

test("填空归一化：去空白、转小写", () => {
  assert.equal(normalizeAnswerText("  M A R "), "mar");
  assert.equal(normalizeAnswerText("关 中断"), "关中断");
});

test("整章判分与掌握度", () => {
  const ch3 = questionsForChapter("ch3");
  const allRight = Object.fromEntries(ch3.map((question) => [question.id, rightAnswerFor(question)]));
  const perfect = gradeChapterQuestions("ch3", allRight);
  assert.equal(perfect.earned, perfect.total);
  assert.equal(perfect.correctCount, ch3.length);
  assert.equal(chapterMasteryOf("ch3", allRight), 100);

  const empty = gradeChapterQuestions("ch3", {});
  assert.equal(empty.earned, 0);
  assert.equal(chapterMasteryOf("ch3", {}), 0);

  const oneRight = gradeChapterQuestions("ch3", { "ch3-q01": "0" });
  assert.equal(oneRight.earned, 10);
  assert.ok(chapterMasteryOf("ch3", { "ch3-q01": "0" }) > 0);
});

test("答案与题目逻辑自洽（抽核关键题）", () => {
  assert.equal(questionOf("ch2-q01").answer, "11.25", "1011.01₂ = 11.25");
  assert.equal(questionOf("ch2-q04").answer, "-1", "11111111 补码 = -1");
  assert.equal(questionOf("ch2-q07").answer, "11111011", "-5 的 8 位补码");
  assert.equal(questionOf("ch3-q05").answer, "true", "S=A⊕B, C=A·B");
  assert.equal(questionOf("ch6-q04").answer, "false", "PC 存下一条指令地址而非当前指令");
  assert.equal(ASSIGNMENT_QUESTIONS.length, 70, "保留 58 道原题并新增 12 道关卡练习");
});

/** 从题库自身推导正确答案（仅用于构造全对答案表，不校验内容）。 */
function rightAnswerFor(question) {
  if (question.type === "choice") return question.answer;
  if (question.type === "truefalse") return question.answer;
  if (question.type === "fill") {
    return question.keywords.map((group) => (Array.isArray(group) ? group[0] : group)).join("，");
  }
  return "";
}
