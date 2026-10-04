import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowsClockwise, ChartLineUp, ChalkboardTeacher, Student } from '@phosphor-icons/react';
import { apiRequest } from '../../apiClient.js';
import './teacherLearningReview.css';

const Records = lazy(() => import('../StudentRecords.jsx').then(module => ({ default: module.StudentRecords })));
const Mistakes = lazy(() => import('../MistakeBookPage.jsx').then(module => ({ default: module.MistakeBookPage })));
const SOURCE = { lab: '实验室', practice: '题库练习', assignment: '课后作业', service: '维修诊断' };

export function TeacherLearningReview({ mode, classes, classId, onClassChange, selectedStudent, onStudentChange, changeView, navigateToChallenge, openStudyTarget }) {
  const [classData, setClassData] = useState(null), [detail, setDetail] = useState(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [version, setVersion] = useState(0);
  const own = selectedStudent === 'mine';
  useEffect(() => {
    let cancelled = false;
    setClassData(null); setDetail(null); setError(''); setLoading(true);
    async function load() {
      try {
        if (own) {
          const data = await apiRequest('/api/teacher/learning-review');
          if (!cancelled) setDetail(data);
        } else if (classId) {
          const base = `/api/teacher/classes/${classId}/learning-review`;
          const [overview, student] = await Promise.all([apiRequest(base), selectedStudent === 'all' ? Promise.resolve(null) : apiRequest(base + '/' + selectedStudent)]);
          if (!cancelled) { setClassData(overview); setDetail(student); }
        }
      } catch (failure) { if (!cancelled) setError(failure.message); }
      finally { if (!cancelled) setLoading(false); }
    }
    load(); return () => { cancelled = true; };
  }, [classId, selectedStudent, version, own]);
  const analysis = detail?.analysis ?? classData?.analysis;
  const select = (id, view) => { onStudentChange(String(id)); if (view !== mode) changeView(view); };
  return <div className="teacher-learning-review" data-testid="teacher-learning-review">
    <header className="section-panel teacher-review-heading">
      <div><span className="eyebrow">TEACHING / LEARNING REVIEW</span><h1><ChartLineUp size={25}/>{mode === 'records' ? '学习记录' : '错题本'}</h1><p>查看班级和学生的真实记录，安排讲解与复习。教师试练单独保存。</p></div>
      <button type="button" className="ghost-button" onClick={() => setVersion(value => value + 1)} disabled={loading}><ArrowsClockwise size={17}/>刷新学情与分析</button>
    </header>
    <section className="section-panel teacher-review-controls" aria-label="教师学情筛选">
      <label>班级<select aria-label="学情班级" value={classId ?? ''} onChange={event => { onStudentChange('all'); onClassChange(Number(event.target.value)); }}><option value="" disabled>选择班级</option>{classes.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label>查看对象<select aria-label="学情查看对象" value={selectedStudent} onChange={event => onStudentChange(event.target.value)}><option value="all">全班概览</option><option value="mine">我的教师试练</option>{(classData?.students ?? []).map(student => <option key={student.id} value={student.id}>{student.displayName} · {student.username}</option>)}{!classData && !own && selectedStudent !== 'all' && <option value={selectedStudent}>正在读取学生…</option>}</select></label>
      <div className="teacher-review-tabs" aria-label="学情内容"><button type="button" aria-pressed={mode === 'records'} onClick={() => changeView('records')}>学习记录</button><button type="button" aria-pressed={mode === 'mistakes'} onClick={() => changeView('mistakes')}>错题本</button></div>
    </section>
    {loading ? <p className="section-panel" role="status">正在同步学情与错题…</p> : error ? <section className="section-panel"><p role="alert">{error}</p><button type="button" className="primary-button" onClick={() => setVersion(value => value + 1)}>重试学情加载</button></section> : !own && !classId ? <section className="section-panel"><h2>还没有班级</h2><p>可以先查看“我的教师试练”，或到教师看板创建班级并导入学生。</p><button type="button" className="primary-button" onClick={() => changeView('teacher')}>前往教师看板</button></section> : <>
      {analysis && <section className="section-panel teacher-review-analysis" aria-label="学情分析">
        <div className="section-heading"><div><h2>{detail ? `${own ? '教师试练' : detail.displayName} · 学情分析` : '全班学情分析'}</h2><p>根据已提交的实验、题库与作业计算；没有记录时显示暂无数据。</p></div><span className="teacher-analysis-source">系统内分析</span></div>
        <div className="teacher-review-metrics"><div><span>{detail ? '练习题已判分' : '有提交记录的学生'}</span><strong>{detail ? detail.practice.answered : `${analysis.submittedStudents} / ${analysis.studentCount}`}</strong></div><div><span>待巩固错题</span><strong>{analysis.pendingMistakes}</strong></div><div><span>{detail ? '已提交 / 已发布作业' : '班级学生'}</span><strong>{detail ? `${detail.homework.submitted} / ${detail.homework.assigned}` : analysis.studentCount}</strong></div><div><span>{detail ? '作业已批改均分' : '高频错误主题'}</span><strong>{detail ? detail.homework.averageScore == null ? '暂无成绩' : detail.homework.averageScore + '%' : analysis.commonErrors.length}</strong></div></div>
        <details className="teacher-analysis-disclosure" open={!detail}><summary>章节进度、错误归因与教学建议</summary><div className="teacher-analysis-grid">
          <div className="teacher-analysis-card"><h3>各章实验完成进度</h3>{analysis.chapters.map(chapter => <div className="teacher-analysis-chapter" key={chapter.id}><span>{chapter.title}</span><small>{chapter.completed}/{chapter.possible} · {chapter.averageScore == null ? '暂无计分成绩' : '计分均分 ' + chapter.averageScore}</small><div className="teacher-analysis-track"><i style={{width:chapter.completionRate+'%'}}/></div></div>)}</div>
          <div className="teacher-analysis-card"><h3>建议下一步</h3><ol>{analysis.advice.map((advice,index) => <li key={index}>{advice}</li>)}</ol><h3>高频待巩固内容</h3>{analysis.commonErrors.length ? analysis.commonErrors.map((item,index) => <article className="teacher-common-error" key={index}><strong>{item.title}</strong><small>{SOURCE[item.source]} · {item.students} 人 · {item.count} 次错误</small></article>) : <p>暂无待巩固错误记录。</p>}</div>
        </div></details>
      </section>}
      {!detail && classData && <section className="section-panel teacher-review-roster" aria-label="班级学生学情"><div className="section-heading"><div><h2><Student size={20}/>学生学情</h2><p>选择学生，查看完整图表或跨来源错题。</p></div></div>{classData.students.length ? <div className="teacher-review-table-scroll"><table><thead><tr><th>学生</th><th>实验完成</th><th>待巩固</th><th>题库判分</th><th>作业提交</th><th>查看</th></tr></thead><tbody>{classData.students.map(student => <tr key={student.id} data-review-student={student.id}><td><strong>{student.displayName}</strong><small>{student.username}</small></td><td>{student.summary.completedCount}/{LEARNING_TOTAL(student.summary)}</td><td>{student.mistakeOverview.pendingCount ?? 0}</td><td>{student.practice.answered} 题</td><td>{student.homework.submitted}/{student.homework.assigned}</td><td><button type="button" className="ghost-button" onClick={() => select(student.id,'records')}>学习记录</button><button type="button" className="ghost-button" onClick={() => select(student.id,'mistakes')}>错题本</button></td></tr>)}</tbody></table></div> : <p>本班暂无学生，请在教师看板导入学生。</p>}
        {analysis?.support.length > 0 && <details className="teacher-analysis-disclosure"><summary>建议关注的学生</summary>{analysis.support.map(student => <div className="teacher-support-row" key={student.id}><strong>{student.displayName}</strong><span>{student.reasons.join('；')}</span><button className="ghost-button" type="button" onClick={() => select(student.id,'records')}>查看记录</button></div>)}</details>}
      </section>}
      {detail && <><div className="teacher-review-scope" role="status"><ChalkboardTeacher size={18}/><span>{own ? '当前为教师个人试练，仅记录在你的账号中。' : `正在查看 ${detail.displayName}（${detail.username}）的记录；实验和题目入口进入教师试讲，不会代替学生提交。`}</span></div><Suspense fallback={<p role="status">正在加载学习视图…</p>}>{mode === 'records' ? <Records key={detail.id} userId={detail.id} progress={detail.progress} summary={detail.summary} reviewData={detail} assistantEnabled={false} changeView={changeView} selectChallenge={navigateToChallenge} openStudyTarget={openStudyTarget}/> : <Mistakes key={detail.id} suppliedBook={detail.mistakes} readOnly={!own} assistantEnabled={false} changeView={changeView} navigateToChallenge={navigateToChallenge} openStudyTarget={openStudyTarget}/>}</Suspense></>}
    </>}
  </div>;
}
function LEARNING_TOTAL(summary) { return (summary.completedCount ?? 0) + (summary.inProgressCount ?? 0) + (summary.unlockedCount ?? 0) + (summary.lockedCount ?? 0); }
