import { Camera, CheckCircle, SpinnerGap, Trash, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../apiClient.js";
import { COURSE_CHAPTERS } from "../../courseChapters.js";
import { knowledgePointsByChapter } from "../../knowledgePoints.js";
import { boxClipPath, fileToCompressedDataUrl, mergeDraftQuestions } from "../../photoMistakes.js";
import { personalLearningPath } from "../../personalLearningApi.js";

const QTYPES = [["choice", "选择题"], ["truefalse", "判断题"], ["fill", "填空题"], ["short_answer", "简答题"]];
const MAX_IMAGES = 4;

/**
 * 拍照导入对话框：选照片 → AI 识别切题 → 学生核对（改题干/章节/知识点、合并、删除）→ 归档进错题本。
 * 识别后的草稿已存服务端；核对编辑通过 PUT 整体替换，最后归档。
 */
export function PhotoImportDialog({ onClose, onArchived }) {
  const [step, setStep] = useState("pick"); // pick | recognizing | review
  const [images, setImages] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [consent, setConsent] = useState(false);
  const [detail, setDetail] = useState(null); // { import, questions }
  const [drafts, setDrafts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedImports, setSavedImports] = useState(null);
  const [draftLoadError, setDraftLoadError] = useState("");
  const submissionRef = useRef(crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    api.photoCapabilities().then((data) => { if (!cancelled) setCapabilities(data); })
      .catch(() => { if (!cancelled) setCapabilities({ vision: false, textAi: false }); });
    api.photoImportDrafts().then((data) => { if (!cancelled) setSavedImports(data.imports); })
      .catch((err) => { if (!cancelled) setDraftLoadError(err.message); });
    return () => { cancelled = true; };
  }, []);

  async function pickFiles(event) {
    const files = [...(event.target.files ?? [])].filter((file) => /^image\/(png|jpeg|webp)/.test(file.type));
    event.target.value = "";
    if (!files.length) { setError("请选择 PNG / JPEG / WebP 图片"); return; }
    setError("");
    setBusy(true);
    try {
      const compressed = [];
      for (const file of files.slice(0, MAX_IMAGES - images.length)) compressed.push(await fileToCompressedDataUrl(file));
      setImages((value) => [...value, ...compressed].slice(0, MAX_IMAGES));
      submissionRef.current = crypto.randomUUID();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function recognize() {
    if (busy || !images.length || !consent) return;
    setBusy(true); setError(""); setStep("recognizing");
    try {
      const data = await api.createPhotoImport({ images, consent, clientSubmissionId: submissionRef.current });
      applyDetail(data);
      setNotice("识别结果已保存。请逐题核对：题干、章节和知识点都可以修改，识别错的可以删除或合并；编辑后可保存草稿稍后继续。");
    } catch (err) {
      setError(err.message);
      setStep("pick");
    } finally { setBusy(false); }
  }

  async function restoreDraft(id) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const data = await api.photoImport(id);
      if (data.import.status !== "review") throw new Error("这份草稿已归档，请关闭后刷新错题本。");
      applyDetail(data);
      setNotice("已恢复待核对草稿，无需重新识别。核对后可归档，或保存草稿稍后继续。");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function saveAndClose() {
    if (busy) return;
    setBusy(true); setError("");
    try { await saveDrafts(); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function applyDetail(data) {
    setDetail(data);
    setDrafts(data.questions.map((question) => ({ ...question, optionsText: (question.options ?? []).join("\n") })));
    setSelected(new Set());
    setStep("review");
  }

  function patchDraft(index, patch) {
    setDrafts((value) => value.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  }

  function toggleSelect(index) {
    setSelected((value) => {
      const next = new Set(value);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function mergeSelected() {
    if (selected.size < 2) return;
    setDrafts((value) => mergeDraftQuestions(value, [...selected]));
    setSelected(new Set());
    setNotice("已合并为一道题，请核对合并后的题干。");
  }

  function toPayload(draftsValue) {
    return draftsValue.map((draft) => ({
      imageIndex: draft.imageIndex,
      chapterId: draft.chapterId || null,
      knowledgeLabel: draft.knowledgeLabel ?? "",
      qtype: draft.qtype,
      stem: draft.stem,
      studentAnswer: draft.studentAnswer ?? "",
      referenceAnswer: draft.referenceAnswer ?? "",
      explanation: draft.explanation ?? "",
      options: draft.qtype === "choice" ? String(draft.optionsText ?? "").split(/\n/).map((line) => line.trim()).filter(Boolean) : [],
      box: draft.box,
    }));
  }

  async function saveDrafts() {
    const data = await api.updatePhotoImportQuestions(detail.import.id, toPayload(drafts));
    return data;
  }

  async function saveAndArchive() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await saveDrafts();
      await api.archivePhotoImport(detail.import.id);
      onArchived?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const knowledgeOptions = useMemo(() => {
    const map = new Map();
    for (const draft of drafts) {
      if (!draft.chapterId || map.has(draft.chapterId)) continue;
      map.set(draft.chapterId, knowledgePointsByChapter(draft.chapterId).map((point) => point.title));
    }
    return map;
  }, [drafts]);

  return (
    <div className="photo-dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !busy && step !== "recognizing") onClose(); }}>
      <div className="photo-dialog" role="dialog" aria-modal="true" aria-label="拍照导入错题">
        <header className="photo-dialog-header">
          <h2><Camera size={20} weight="duotone" /> 拍照导入错题</h2>
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy || step === "recognizing"} aria-label="关闭"><X size={16} /></button>
        </header>

        {step === "pick" || step === "recognizing" ? (
          <div className="photo-pick">
            {savedImports === null && !draftLoadError ? <p role="status">正在查找待核对草稿…</p> : null}
            {draftLoadError ? <p className="form-error" role="alert">草稿列表加载失败：{draftLoadError}。请关闭后重新打开。</p> : null}
            {savedImports?.length ? (
              <section className="photo-saved-drafts" aria-label="待核对草稿">
                <h3>继续核对草稿</h3>
                <ul>
                  {savedImports.map((draft) => <li key={draft.id}>
                    <span>{new Date(draft.createdAt).toLocaleString("zh-CN")} · {draft.questionCount} 道题</span>
                    <button type="button" className="ghost-button" onClick={() => restoreDraft(draft.id)} disabled={busy}>继续核对</button>
                  </li>)}
                </ul>
              </section>
            ) : null}
            <p>把作业、试卷或草稿纸上做错的题拍下来（一次最多 {MAX_IMAGES} 张），AI 会自动切题、识别题干和你的作答，并按课程章节与知识点归档。</p>
            {capabilities && !capabilities.vision ? (
              <p className="note-error" role="alert">拍照识别尚未配置视觉模型，请联系管理员；也可以先在题库练习或课后作业中积累错题。</p>
            ) : (
              <>
                <div className="photo-pick-list">
                  {images.map((image, index) => (
                    <figure key={index} className="photo-pick-item">
                      <img src={image} alt={`待识别照片 ${index + 1}`} />
                      <button type="button" className="ghost-button" onClick={() => { setImages((value) => value.filter((_, i) => i !== index)); submissionRef.current = crypto.randomUUID(); }} disabled={busy}><Trash size={14} /> 移除</button>
                    </figure>
                  ))}
                  {images.length < MAX_IMAGES ? (
                    <label className="photo-pick-add">
                      <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={pickFiles} disabled={busy} />
                      <Camera size={28} weight="duotone" />
                      <span>{images.length ? "再加一张" : "选择照片"}</span>
                    </label>
                  ) : null}
                </div>
                <label className="photo-consent">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} />
                  我了解：识别时会把所选照片发送给课程视觉模型；照片和错题数据只保存在本平台。
                </label>
              </>
            )}
            {step === "recognizing" ? <p className="photo-recognizing" role="status"><SpinnerGap size={18} className="spin" /> 正在识别切题，通常需要十几秒…</p> : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {capabilities?.vision ? (
              <div className="photo-dialog-actions">
                <button type="button" className="primary-button" onClick={recognize} disabled={busy || !images.length || !consent}>
                  {busy ? "正在识别…" : "开始识别"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "review" && detail ? (
          <div className="photo-review">
            {notice ? <p className="photo-review-notice" role="status">{notice}</p> : null}
            <div className="photo-review-toolbar">
              <span>{drafts.length} 道题待核对</span>
              <button type="button" className="ghost-button" onClick={mergeSelected} disabled={busy || selected.size < 2}>合并选中的 {selected.size} 题</button>
            </div>
            <div className="photo-review-list">
              {drafts.map((draft, index) => (
                <section className="photo-draft" key={index} data-testid="photo-draft">
                  <div className="photo-draft-side">
                    <label className="photo-draft-select"><input type="checkbox" checked={selected.has(index)} onChange={() => toggleSelect(index)} /> 选择</label>
                    <img
                      className="photo-draft-image"
                      src={personalLearningPath(`/api/student/photo-imports/${detail.import.id}/image/${draft.imageIndex}`)}
                      alt={`第 ${index + 1} 题拍照区域`}
                      style={boxClipPath(draft.box) ? { clipPath: boxClipPath(draft.box) } : undefined}
                    />
                    <span className="photo-draft-index">第 {index + 1} 题 · 照片 {draft.imageIndex + 1}</span>
                  </div>
                  <div className="photo-draft-fields">
                    <label>题干
                      <textarea rows={3} maxLength={2000} value={draft.stem} onChange={(event) => patchDraft(index, { stem: event.target.value })} />
                    </label>
                    <div className="photo-draft-row">
                      <label>章节
                        <select value={draft.chapterId ?? ""} onChange={(event) => patchDraft(index, { chapterId: event.target.value || null })}>
                          <option value="">请选择章节</option>
                          {COURSE_CHAPTERS.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                        </select>
                      </label>
                      <label>知识点
                        <input type="text" maxLength={60} value={draft.knowledgeLabel ?? ""} list={`kp-${index}`} onChange={(event) => patchDraft(index, { knowledgeLabel: event.target.value })} />
                        <datalist id={`kp-${index}`}>{(knowledgeOptions.get(draft.chapterId) ?? []).map((title) => <option key={title} value={title} />)}</datalist>
                      </label>
                      <label>题型
                        <select value={draft.qtype} onChange={(event) => patchDraft(index, { qtype: event.target.value })}>
                          {QTYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                      </label>
                    </div>
                    {draft.qtype === "choice" ? (
                      <label>选项（每行一个）
                        <textarea rows={3} value={draft.optionsText} onChange={(event) => patchDraft(index, { optionsText: event.target.value })} />
                      </label>
                    ) : null}
                    <div className="photo-draft-row">
                      <label>我的原作答
                        <input type="text" maxLength={2000} value={draft.studentAnswer ?? ""} onChange={(event) => patchDraft(index, { studentAnswer: event.target.value })} />
                      </label>
                      <label>参考答案
                        <input type="text" maxLength={2000} value={draft.referenceAnswer ?? ""} onChange={(event) => patchDraft(index, { referenceAnswer: event.target.value })} />
                      </label>
                    </div>
                    <button type="button" className="ghost-button photo-draft-remove" onClick={() => setDrafts((value) => value.filter((_, i) => i !== index))} disabled={busy}>
                      <Trash size={14} /> 删除这道题
                    </button>
                  </div>
                </section>
              ))}
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="photo-dialog-actions">
              <button type="button" className="ghost-button" onClick={saveAndClose} disabled={busy || !drafts.length}>保存草稿并关闭</button>
              <button type="button" className="primary-button" onClick={saveAndArchive} disabled={busy || !drafts.length}>
                <CheckCircle size={16} /> {busy ? "正在归档…" : "核对无误，收入错题本"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
