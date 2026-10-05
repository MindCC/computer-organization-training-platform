import { useEffect, useRef, useState } from "react";
import { BookOpen, Presentation, UploadSimple, NotePencil, ArrowsOut } from "@phosphor-icons/react";
import { init as initPptxPreview } from "pptx-preview";
import { COURSEWARE } from "../courseware.js";
import { api } from "../apiClient.js";

/** 用 pptx-preview 在浏览器里直接渲染 PPTX，不再依赖服务端转换。 */
function PptxStage({ upload }) {
  const hostRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let previewer = null;
    const host = hostRef.current;
    if (!host) return undefined;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const response = await fetch(`/api/courseware/uploads/${upload.id}/file`, { credentials: "include" });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `课件加载失败：${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        host.innerHTML = "";
        const width = Math.max(640, host.clientWidth || 900);
        previewer = initPptxPreview(host, { width, height: Math.round((width * 9) / 16), mode: "list" });
        await previewer.preview(buffer);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message ?? "课件渲染失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      try { previewer?.destroy?.(); } catch { /* ignore teardown races */ }
    };
  }, [upload.id]);

  return (
    <div className="pptx-stage">
      {loading && <div className="pptx-stage-empty">正在渲染课件…</div>}
      {!loading && error && <div className="pptx-stage-error">{error}</div>}
      <div ref={hostRef} className="pptx-render-host" hidden={loading || Boolean(error)} />
    </div>
  );
}

export function CoursewareView({ navigateToChallenge, auth, teacherClasses = [], selectedTeacherClassId, onSelectTeacherClass, initialChapterId } = {}) {
  /** 章节大纲里哪些章节已展开——讲演只出现在对应章节内，且展开才挂载 iframe */
  const [openOutlineChapters, setOpenOutlineChapters] = useState(() => (initialChapterId ? { [initialChapterId]: true } : {}));
  /** 课堂任务链等深链会指定章节：章节变化时自动展开对应大纲 */
  useEffect(() => {
    if (initialChapterId) setOpenOutlineChapters((current) => (current[initialChapterId] ? current : { ...current, [initialChapterId]: true }));
  }, [initialChapterId]);
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
    setUploading(true); setUploadMessage("正在上传课件，请稍候…");
    try {
      const result = await api.uploadCourseware(file, auth.user.role === "teacher" ? selectedTeacherClassId : null);
      setUploadMessage(result.upload.status === "ready" ? "上传完成，可以开始演示和记笔记。" : result.upload.errorMessage ?? "上传失败，请重试。");
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


      

      {auth?.user && <section className="upload-courseware-panel">
        <div>
          <strong><UploadSimple size={18} /> 上传自己的 PPTX 课件</strong>
          <p>{auth.user.role === "teacher" ? "上传后立即在浏览器中渲染，并发布给当前教师看板所选班级。" : "上传后仅你本人和任课教师可见，不会向小组或全班公开。"}</p>
        </div>
        <div className="courseware-upload-actions">
          {auth.user.role === "teacher" && (teacherClasses.length > 0 ? (
            <label className="courseware-class-label">
              发布班级：
              <select
                aria-label="选择发布课件的班级"
                value={selectedTeacherClassId ?? ""}
                onChange={(event) => onSelectTeacherClass?.(Number(event.target.value) || null)}
              >
                <option value="">请选择班级</option>
                {teacherClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : (
            <span className="courseware-class-label">还没有班级：请先到「教师指挥台」创建班级。</span>
          ))}
          <label className="primary-button upload-label"><UploadSimple size={16} /> {uploading ? "上传中…" : "选择 PPTX"}<input aria-label="上传 PPTX 课件" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={upload} disabled={uploading || (auth.user.role === "teacher" && !selectedTeacherClassId)} /></label>
        </div>
        {uploadMessage && <p className="courseware-message">{uploadMessage}</p>}
        {auth.user.role === "teacher" && !selectedTeacherClassId && <p className="courseware-message">尚未选择发布班级：在上方选择要发布的班级后即可上传（没有班级请先到「教师指挥台」创建）。</p>}
        {uploads.length > 0 && <div className="uploaded-courseware-list">{uploads.map((item) => <button type="button" key={item.id} className={selectedUpload?.id === item.id ? "uploaded-courseware active" : "uploaded-courseware"} onClick={() => { setSelectedUpload(item); setPageNumber(1); }}><Presentation size={16} /><span>{item.originalName}</span><small>{item.status === "ready" ? "可演示" : item.status === "processing" ? "转换中" : "转换失败"}</small></button>)}</div>}
      </section>}

      {selectedUpload?.status === "ready" && <section className="uploaded-courseware-stage">
        <div className="uploaded-courseware-toolbar"><strong>{selectedUpload.originalName} · {selectedUpload.slideCount} 页</strong><label>当前页 <input type="number" min="1" max={selectedUpload.slideCount} value={pageNumber} onChange={(event) => setPageNumber(Math.min(selectedUpload.slideCount, Math.max(1, Number(event.target.value) || 1)))} /></label></div>
        <div className="uploaded-courseware-content"><PptxStage upload={selectedUpload} /><aside className="page-notes"><h3><NotePencil size={18} /> 第 {pageNumber} 页笔记</h3><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="记录这一页的要点、问题或思路…" /><button type="button" className="primary-button" onClick={submitNote}>保存笔记</button><div className="page-note-list">{notes.length ? notes.map((note) => <article key={note.id}><strong>{note.authorName}{note.visibility === "private" ? "（仅自己可见）" : ""}</strong><p>{note.content}</p></article>) : <p>本页还没有笔记。</p>}</div></aside></div>
      </section>}

      

      {/* 章节大纲（压缩折叠）：有 AI 互动讲演的章节，展开后内嵌播放器 */}
      <section className="courseware-outline">
        <strong><BookOpen size={16} /> 章节大纲</strong>
        {COURSEWARE.chapters.map((ch) => {
          const embeds = ch.embeds ?? [];
          const open = Boolean(openOutlineChapters[ch.id]);
          return (
            <details
              className="outline-chapter"
              key={ch.id}
              open={open}
              onToggle={(event) => {
                const next = event.currentTarget.open;
                setOpenOutlineChapters((current) => (current[ch.id] === next ? current : { ...current, [ch.id]: next }));
              }}
            >
              <summary>{ch.title}<span>{ch.slides} 页PPT · {(ch.sections ?? []).length} 小节{embeds.length ? ` · 含 ${embeds.length > 1 ? `${embeds.length} 个 ` : ""}AI 互动讲演` : ""}</span></summary>
              <div className="outline-body">
                {(ch.sections ?? []).length > 0 ? <div className="section-grid">{ch.sections.map((s, i) => <div className="section-chip" key={i}>{s}</div>)}</div> : null}
                {(ch.keyPoints ?? []).length > 0 ? <ul className="outline-points">{ch.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}</ul> : null}
                {/* 只在展开时挂载 iframe：GKK 讲演是完整应用，避免整页同时加载多个；一章可以有多节讲演 */}
                {open ? embeds.map((embed) => (
                  <div className="outline-lecture" key={embed.src}>
                    <div className="courseware-lecture-player-head">
                      <strong>{embed.title}</strong>
                      <span className="outline-lecture-note">{embed.note}</span>
                      <button
                        className="outline-lecture-fullscreen"
                        onClick={(event) => {
                          const host = event.currentTarget.closest(".outline-lecture");
                          if (!host) return;
                          if (document.fullscreenElement) document.exitFullscreen?.();
                          else host.requestFullscreen?.();
                        }}
                        type="button"
                      >
                        <ArrowsOut size={15} /> 全屏
                      </button>
                    </div>
                    <iframe allowFullScreen key={embed.src} src={embed.src} title={embed.title} />
                  </div>
                )) : null}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
