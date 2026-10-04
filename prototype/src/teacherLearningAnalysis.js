import { LEARNING_ITEMS } from './platformLogic.js';
import { COURSE_CHAPTERS, isParticipationChallenge } from './courseChapters.js';

export function analyzeTeachingRecords(students = []) {
  const total = students.length;
  const chapters = COURSE_CHAPTERS.map(chapter => {
    const challenges = LEARNING_ITEMS.filter(item => item.chapterId === chapter.id);
    let completed = 0, attempted = 0, scoreSum = 0, scored = 0;
    for (const student of students) for (const item of challenges) {
      const record = student.progress?.[item.id];
      if (record?.status === 'completed') completed++;
      if (record?.attempts > 0) attempted++;
      if (!isParticipationChallenge(item) && record?.status === 'completed') { scored++; scoreSum += record.bestScore ?? 0; }
    }
    const possible = challenges.length * total;
    return { id: chapter.id, title: chapter.title, completed, possible, attempted, completionRate: possible ? Math.round(completed / possible * 100) : 0, averageScore: scored ? Math.round(scoreSum / scored) : null };
  });
  const errors = new Map();
  for (const student of students) for (const item of student.mistakes?.items ?? []) {
    if (item.resolved) continue;
    const key = [item.source, item.questionId ?? item.challengeId ?? item.title, item.errorType].join(':');
    if (!errors.has(key)) errors.set(key, { title: item.stem ?? item.title ?? item.challengeTitle, source: item.source, count: 0, studentIds: new Set(), navigation: item.navigation });
    const error = errors.get(key); error.count += item.count ?? 1; error.studentIds.add(student.id);
  }
  const commonErrors = [...errors.values()].map(({ studentIds, ...item }) => ({ ...item, students: studentIds.size })).sort((a,b) => b.students - a.students || b.count - a.count).slice(0, 6);
  const submitted = students.filter(student => Object.values(student.progress ?? {}).some(record => record.attempts > 0) || student.practice?.answered > 0 || student.homework?.submitted > 0);
  const pendingMistakes = students.reduce((sum, student) => sum + (student.mistakes?.overview?.pendingCount ?? 0), 0);
  const support = students.map(student => {
    const attempts = Object.values(student.progress ?? {}).reduce((sum, record) => sum + (record.attempts ?? 0), 0);
    const pending = student.mistakes?.overview?.pendingCount ?? 0;
    const homework = student.homework ?? {};
    const reasons = [];
    if (!attempts && !student.practice?.answered && !homework.submitted) reasons.push('尚无提交记录，先确认是否已进入课程');
    if (pending) reasons.push(`${pending} 项错题待巩固`);
    if ((homework.assigned ?? 0) > (homework.submitted ?? 0)) reasons.push(`${homework.assigned - homework.submitted} 份作业未提交（不等同于逾期）`);
    return { id: student.id, displayName: student.displayName, reasons };
  }).filter(student => student.reasons.length).sort((a,b) => b.reasons.length - a.reasons.length).slice(0, 8);
  const advice = [];
  if (!total) advice.push('当前班级暂无学生，请先导入学生，再查看学情。');
  else if (!submitted.length) advice.push('尚无学习提交记录，建议先组织一次入门实验，再根据实际结果安排复习。');
  else {
    if (commonErrors.length) advice.push(`优先讲解「${commonErrors[0].title}」：${commonErrors[0].students} 名学生仍有待巩固记录。用一个示例演示，再安排独立重练。`);
    const explored = chapters.filter(chapter => chapter.attempted > 0).sort((a,b) => a.completionRate - b.completionRate);
    if (explored.length) advice.push(`「${explored[0].title}」已有尝试，实验完成率 ${explored[0].completionRate}%。先确认卡点，再安排分组练习；完成率不代表知识掌握程度。`);
    const grading = students.reduce((sum, student) => sum + (student.homework?.pendingGrading ?? 0), 0);
    if (grading) advice.push(`${grading} 份已提交作业尚待批改，建议先给出反馈，再判断作业表现。`);
    if (!pendingMistakes) advice.push('目前没有待巩固错题，可安排迁移练习；没有错误记录不代表已掌握全部知识。');
  }
  return { studentCount: total, submittedStudents: submitted.length, pendingMistakes, chapters, commonErrors, support, advice };
}
