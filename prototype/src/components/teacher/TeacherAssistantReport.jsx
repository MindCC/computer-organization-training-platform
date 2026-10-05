import { Sparkle } from "@phosphor-icons/react";
import { CHALLENGES } from "../../platformLogic.js";

const challengeNames = new Map(CHALLENGES.map((challenge) => [challenge.id, challenge.title]));

/** 智能助教面板：展示 AI（或本地规则降级）生成的课堂行动建议。 */
export function TeacherAssistantReport({ assistant, selectedTeacherClassId, assistantLoading, assistantError, generateAssistantReport, students = [], onOpenStudent, canAdoptPlan = true, onAdoptPlan }) {
  const report = assistant?.report ?? {};
  const riskStudents = report.riskStudents ?? [];
  const groupingPlan = report.groupingPlan ?? [];
  const misconceptions = report.commonMisconceptions ?? [];
  const nextClassPlan = report.nextClassPlan ?? [];
  const evidence = report.evidence ?? [];
  const studentsById = new Map(students.map((student) => [student.id, student]));

  return (
    <section className="teacher-studio-panel teacher-assistant-panel">
      <div className="teacher-assistant-header">
        <div>
          <span className="eyebrow">智能助教</span>
          <h2>课堂行动建议</h2>
          <p>根据当前班级学情生成下节课重点、分层辅导和讲解提示。</p>
        </div>
      </div>
      <div className="teacher-assistant-toolbar">
        <button className="primary-button" disabled={!selectedTeacherClassId || assistantLoading} onClick={generateAssistantReport} type="button">
          <Sparkle size={16} />{assistantLoading ? "生成中..." : "生成 AI 助教建议"}
        </button>
      </div>
      {assistantError ? <p className="teacher-ai-warning">{assistantError}</p> : null}
      {assistant ? (
        <div className="teacher-assistant-report">
          <div className="teacher-assistant-report-header">
            <span>{assistant.source === "ai" ? "DeepSeek 生成" : "本地降级建议"}</span>
            {assistant.generatedAt ? <small>{new Date(assistant.generatedAt).toLocaleString()}</small> : null}
          </div>
          {assistant.fallbackReason ? <p className="teacher-ai-warning">{assistant.fallbackReason}</p> : null}
          <section><strong>下节课重点</strong><p>{report.lessonFocus}</p></section>
          <section>
            <strong>重点关注学生</strong>
            {riskStudents.length > 0
              ? riskStudents.map((s, i) => <p key={s.studentId ?? i}>{s.name ?? "学生"}：{s.reason ?? "需要关注"}{s.suggestion ? `。${s.suggestion}` : ""}</p>)
              : <p>暂无重点风险学生。</p>}
          </section>
          <section>
            <strong>分层辅导</strong>
            {groupingPlan.length > 0
              ? groupingPlan.map((g, i) => <p key={g.group ?? i}>{g.group ?? "分组"}：{g.activity ?? g.criteria ?? "按当前学情安排练习"}</p>)
              : <p>暂无分组建议。</p>}
          </section>
          <section>
            <strong>共性错误</strong>
            {misconceptions.length > 0 ? misconceptions.map((m) => <p key={m}>{m}</p>) : <p>暂无明显共性错误。</p>}
          </section>
          <section>
            <strong>课堂安排</strong>
            {nextClassPlan.length > 0 ? nextClassPlan.map((n) => <p key={n}>{n}</p>) : <p>暂无课堂安排建议。</p>}
          </section>
          <section><strong>教师讲解提示</strong><p>{report.teacherScript}</p></section>
          <section className="teacher-assistant-evidence">
            <strong>建议依据</strong>
            {evidence.length > 0 ? evidence.map((item, index) => <div className="teacher-evidence-item" key={item.id ?? `${item.type}-${index}`}>
              <b>{item.id ?? `证据 ${index + 1}`} · {item.label}</b>
              <span>{item.type === "class_summary" ? `班级人数 ${item.count}` : `${item.count} 条关联记录`}{item.challengeIds?.length ? ` · 关卡：${item.challengeIds.map((id) => challengeNames.get(id) ?? id).join("、")}` : ""}</span>
              {item.studentIds?.length ? <div className="teacher-evidence-students">涉及学生：{item.studentIds.map((id) => {
                const student = studentsById.get(id);
                return student ? <button type="button" key={id} onClick={() => onOpenStudent?.(id)}>{student.displayName ?? student.name ?? `学生 ${id}`}</button> : <span key={id}>学生 {id}</span>;
              })}</div> : null}
            </div>) : <p>当前暂无可定位的学习记录，建议先积累课堂提交后再用于备课。</p>}
          </section>
          <div className="teacher-assistant-toolbar">
            <button type="button" className="primary-button" disabled={!canAdoptPlan || !selectedTeacherClassId || evidence.length === 0} onClick={() => onAdoptPlan?.({
              focus: String(report.lessonFocus ?? "").slice(0, 500),
              steps: nextClassPlan.length ? nextClassPlan.slice(0, 8).map((step) => String(step).slice(0, 300)) : [String(report.lessonFocus ?? "").slice(0, 300)],
              teacherScript: String(report.teacherScript ?? "").slice(0, 1000),
            })}>采纳并编辑课堂草稿</button>
            {!canAdoptPlan && <p>当前班级已有课堂任务，请结束后再创建下一次草稿。</p>}
          </div>
        </div>
      ) : (
        <p className="empty-state">选择班级后生成建议；AI 不可用时会自动使用本地规则。</p>
      )}
    </section>
  );
}
