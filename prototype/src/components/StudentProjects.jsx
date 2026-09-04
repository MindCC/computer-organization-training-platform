import { useEffect, useState } from "react";
import { api } from "../apiClient.js";
import { canEditMilestoneSubmission } from "../courseWorkbenchState.js";

function submissionFor(project, milestoneId) { return project.submissions?.find((item) => item.milestoneId === milestoneId) ?? null; }
function newId() { return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function StudentProjects() {
  const [projects, setProjects] = useState([]); const [selected, setSelected] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  async function refresh() { try { setLoading(true); const result = await api.studentProjects(); setProjects(result.projects ?? []); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { refresh(); }, []);
  if (loading) return <main className="project-page"><p>正在加载小组项目…</p></main>;
  if (selected) return <ProjectDetail project={selected} onBack={() => setSelected(null)} onSaved={(next) => { setSelected(next); setProjects((items) => items.map((item) => item.id === next.id ? next : item)); }} />;
  return <main className="project-page"><header><span className="eyebrow">小组项目</span><h1>协作成果工作台</h1><p>提交自己的里程碑反思，查看教师评价。</p></header>{error ? <p className="form-error">{error}</p> : null}<div className="project-card-grid">{projects.map((project) => <button className="project-card" key={project.id} onClick={() => setSelected(project)} type="button"><span>{project.team?.name}</span><strong>{project.title}</strong><small>{project.team?.members?.find((member) => member.role)?.role ?? "成员"} · {project.milestones?.length ?? 0} 个里程碑</small></button>)}</div>{projects.length === 0 ? <section className="empty-state"><strong>暂未加入小组项目</strong><p>教师发布课程并完成分组后，项目会显示在这里。</p></section> : null}</main>;
}

function ProjectDetail({ project: initialProject, onBack, onSaved }) {
  const [project, setProject] = useState(initialProject); const [drafts, setDrafts] = useState({}); const [saving, setSaving] = useState(""); const [error, setError] = useState("");
  async function submit(milestone) {
    const prior = submissionFor(project, milestone.id); const value = drafts[milestone.id] ?? { reflection: prior?.reflection ?? "", evidenceUrl: prior?.evidenceUrl ?? "", clientSubmissionId: newId() };
    try { setSaving(milestone.id); setError(""); const result = await api.submitProjectMilestone(project.id, milestone.id, value); const next = { ...project, submissions: [...(project.submissions ?? []).filter((item) => item.milestoneId !== milestone.id), result.submission] }; setProject(next); onSaved(next); } catch (e) { setError(e.message); } finally { setSaving(""); }
  }
  return <main className="project-page"><button className="ghost-button" onClick={onBack} type="button">返回项目列表</button><header><span className="eyebrow">{project.team?.name}</span><h1>{project.title}</h1><p>{project.description}</p></header>{error ? <p className="form-error">{error}</p> : null}<div className="project-roster">{project.team?.members?.map((member) => <span key={member.studentId}>{member.displayName} · {member.role}</span>)}</div>{project.milestones?.map((milestone) => { const prior = submissionFor(project, milestone.id); const editable = canEditMilestoneSubmission(prior); const value = drafts[milestone.id] ?? { reflection: prior?.reflection ?? "", evidenceUrl: prior?.evidenceUrl ?? "", clientSubmissionId: prior?.clientSubmissionId ?? newId() }; return <section className="project-milestone" key={milestone.id}><h2>{milestone.title}</h2><p>{milestone.description}</p>{milestone.dueAt ? <small>截止：{milestone.dueAt}</small> : null}<label>个人反思<textarea disabled={!editable} value={value.reflection} onChange={(event) => setDrafts({ ...drafts, [milestone.id]: { ...value, reflection: event.target.value } })} /></label><label>HTTPS 成果链接（可选）<input disabled={!editable} value={value.evidenceUrl} onChange={(event) => setDrafts({ ...drafts, [milestone.id]: { ...value, evidenceUrl: event.target.value } })} /></label>{prior?.teacherFeedback ? <p className="project-feedback">教师评价：{prior.teacherFeedback}</p> : null}{editable ? <button className="primary-button" disabled={saving === milestone.id} onClick={() => submit(milestone)} type="button">{saving === milestone.id ? "正在提交…" : "提交里程碑"}</button> : <strong>已评价</strong>}</section>; })}</main>;
}
