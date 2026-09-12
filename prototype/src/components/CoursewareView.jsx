import { useEffect, useState } from "react";
import { BookOpen, CaretRight, ArrowSquareOut, Lightbulb, Flask, Presentation, Star, UploadSimple, NotePencil } from "@phosphor-icons/react";
import { COURSEWARE } from "../courseware.js";
import { api } from "../apiClient.js";

export function CoursewareView({ navigateToChallenge, auth, teacherClasses = [], selectedTeacherClassId }) {
  const [expanded, setExpanded] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");

  const loadUploads = async () => {
    if (!auth?.user) return;
    try {
      const result = await api.coursewareUploads();
      setUploads(result.uploads ?? []);
    } catch (error) { setUploadMessage(error.message); }
  };
  useEffect(() => { loadUploads(); }, [auth?.user?.id]);
  useEffect(() => {
    if (!selectedUpload) return;
    api.coursewareNotes(selectedUpload.id, pageNumber)
      .then((result) => setNotes(result.notes ?? []))
      .catch((error) => setUploadMessage(error.message));
  }, [selectedUpload?.id, pageNumber]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pptx")) return setUploadMessage("目前仅支持 PPTX 格式的课件。");
    if (file.size > 30 * 1024 * 1024) return setUploadMessage("文件不能超过 30MB。");
    setUploading(true); setUploadMessage("正在转换为可演示的 HTML，请稍候…");
    try {
      const result = await api.uploadCourseware(file, auth.user.role === "teacher" ? selectedTeacherClassId : null);
      setUploadMessage(result.upload.status === "ready" ? "转换完成，可以开始演示和记笔记。" : result.upload.errorMessage ?? "转换失败，请检查 PPTX 文件。");
      await loadUploads();
    } catch (error) { setUploadMessage(error.message); }
    finally { setUploading(false); }
  };
  const submitNote = async () => {
    if (!selectedUpload || !noteDraft.trim()) return;
    try {
      await api.addCoursewareNote(selectedUpload.id, { pageNumber, content: noteDraft });
      setNoteDraft("");
      const result = await api.coursewareNotes(selectedUpload.id, pageNumber);
      setNotes(result.notes ?? []);
    } catch (error) { setUploadMessage(error.message); }
  };

  return (
    <div className="courseware-view">
      <header className="courseware-header">
        <BookOpen size={28} />
        <div>
          <h1>{COURSEWARE.title}</h1>
          <p>教材：{COURSEWARE.textbook}</p>
        </div>
        <a href="/courseware.html" target="_blank" rel="noreferrer" className="primary-button" style={{marginLeft:'auto',textDecoration:'none',display:'flex',alignItems:'center',gap:6}}>
          <Presentation size={16} /> 全屏演示
        </a>
      </header>

      {auth?.user && <section className="upload-courseware-panel">
        <div>
          <strong><UploadSimple size={18} /> 上传自己的 PPTX 课件</strong>
          <p>{auth.user.role === "teacher" ? "上传后会发布给当前教师看板所选班级。" : "上传后仅你本人和任课教师可见，不会向小组或全班公开。"}</p>
        </div>
        <div className="courseware-upload-actions">
          {auth.user.role === "teacher" && <span className="courseware-class-label">发布班级：{teacherClasses.find((item) => item.id === selectedTeacherClassId)?.name ?? "请先在教师看板选择班级"}</span>}
          <label className="primary-button upload-label"><UploadSimple size={16} /> {uploading ? "转换中…" : "选择 PPTX"}<input aria-label="上传 PPTX 课件" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={upload} disabled={uploading || (auth.user.role === "teacher" && !selectedTeacherClassId)} /></label>
        </div>
        {uploadMessage && <p className="courseware-message">{uploadMessage}</p>}
        {uploads.length > 0 && <div className="uploaded-courseware-list">{uploads.map((item) => <button type="button" key={item.id} className={selectedUpload?.id === item.id ? "uploaded-courseware active" : "uploaded-courseware"} onClick={() => { setSelectedUpload(item); setPageNumber(1); }}><Presentation size={16} /><span>{item.originalName}</span><small>{item.status === "ready" ? "可演示" : item.status === "processing" ? "转换中" : "转换失败"}</small></button>)}</div>}
      </section>}

      {selectedUpload?.status === "ready" && <section className="uploaded-courseware-stage">
        <div className="uploaded-courseware-toolbar"><strong>{selectedUpload.originalName} · {selectedUpload.slideCount} 页</strong><label>当前页 <input type="number" min="1" max={selectedUpload.slideCount} value={pageNumber} onChange={(event) => setPageNumber(Math.min(selectedUpload.slideCount, Math.max(1, Number(event.target.value) || 1)))} /></label></div>
        <div className="uploaded-courseware-content"><iframe title={`${selectedUpload.originalName} HTML 演示`} src={`/api/courseware/uploads/${selectedUpload.id}/html`} /><aside className="page-notes"><h3><NotePencil size={18} /> 第 {pageNumber} 页笔记</h3><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="记录这一页的要点、问题或思路…" /><button type="button" className="primary-button" onClick={submitNote}>保存笔记</button><div className="page-note-list">{notes.length ? notes.map((note) => <article key={note.id}><strong>{note.authorName}{note.visibility === "private" ? "（仅自己可见）" : ""}</strong><p>{note.content}</p></article>) : <p>本页还没有笔记。</p>}</div></aside></div>
      </section>}

      <div className="courseware-chapters">
        {COURSEWARE.chapters.map((ch) => (
          <div className={`courseware-chapter ${expanded === ch.id ? "expanded" : ""}`} key={ch.id}>
            <button className="chapter-header" onClick={() => setExpanded(expanded === ch.id ? null : ch.id)}>
              <CaretRight size={16} className={`chevron ${expanded === ch.id ? "rotated" : ""}`} />
              <div>
                <strong>{ch.title}</strong>
                <span><Presentation size={12} /> {ch.slides} 页PPT · {ch.sections?.length ?? 0} 个小节</span>
              </div>
            </button>
            {expanded === ch.id && (
              <div className="chapter-body">
                <section>
                  <strong><Star size={14} /> 小节内容</strong>
                  <div className="section-grid">
                    {ch.sections?.map((s, i) => (
                      <div className="section-chip" key={i}>{s}</div>
                    ))}
                  </div>
                </section>
                <section>
                  <strong><Lightbulb size={14} /> 核心知识点</strong>
                  <ul>{ch.keyPoints?.map((kp, i) => <li key={i}>{kp}</li>)}</ul>
                </section>
                <section>
                  <strong><Lightbulb size={14} /> 教学目标</strong>
                  <ul>{ch.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
                </section>
                {ch.discussionQuestions.length > 0 && (
                  <section>
                    <strong>思考题</strong>
                    <ol>{ch.discussionQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol>
                  </section>
                )}
                {ch.linkedChallenges.length > 0 && (
                  <section>
                    <strong><Flask size={14} /> 关联实验</strong>
                    <div className="linked-challenges">
                      {ch.linkedChallenges.map((cid) => (
                        <button key={cid} className="ghost-button" onClick={() => navigateToChallenge?.(cid)}>
                          <ArrowSquareOut size={14} /> 进入实验 →
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="courseware-footer">
        <h3>参考书目</h3>
        {COURSEWARE.references.map((ref, i) => <p key={i}>{i + 1}. {ref}</p>)}
        <p>在线资源：智慧树 杨泽雪 计算机组成原理与体系结构</p>
      </div>
    </div>
  );
}
