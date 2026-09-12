import { Sparkle } from "@phosphor-icons/react";

/** 智能助教面板：展示 AI（或本地规则降级）生成的课堂行动建议。 */
export function TeacherAssistantReport({ assistant, selectedTeacherClassId, assistantLoading, assistantError, generateAssistantReport }) {
  const report = assistant?.report ?? {};
  const riskStudents = report.riskStudents ?? [];
  const groupingPlan = report.groupingPlan ?? [];
  const misconceptions = report.commonMisconceptions ?? [];
  const nextClassPlan = report.nextClassPlan ?? [];

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
        </div>
      ) : (
        <p className="empty-state">选择班级后生成建议；AI 不可用时会自动使用本地规则。</p>
      )}
    </section>
  );
}
