import { useEffect, useRef, useState } from "react";
import { api } from "../apiClient.js";

const FILE_TYPE_LABELS = { txt: "TXT", md: "MD", docx: "DOCX", pdf: "PDF", pptx: "PPTX" };
const UPLOAD_ACCEPT = ".txt,.md,.docx,.pdf,.pptx";
const UPLOAD_STAGES = [
  { id: "uploading", label: "上传文件" },
  { id: "parsing", label: "解析正文" },
  { id: "indexing", label: "分块索引" },
  { id: "analyzing", label: "生成分析" },
];

/** 检索片段里的 \x02/\x03 是服务端的高亮标记：转成段落数组后用 <mark> 渲染（不走 HTML 注入）。 */
function snippetSegments(text) {
  const segments = [];
  let mark = false;
  let buffer = "";
  for (const char of String(text ?? "")) {
    if (char === "\x02" || char === "\x03") {
      if (buffer) segments.push({ text: buffer, mark });
      buffer = "";
      mark = char === "\x02";
    } else {
      buffer += char;
    }
  }
  if (buffer) segments.push({ text: buffer, mark });
  return segments;
}

function HighlightedSnippet({ text }) {
  return (
    <>
      {snippetSegments(text).map((segment, index) =>
        segment.mark ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatKbDate(createdAt) {
  const raw = String(createdAt ?? "");
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  const pad = (value) => String(value).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * 知识库（LLMWiki 式）：上传文件 → 系统解析正文 → 分块 → 全文索引 → 自动分析，
 * 支持全文检索与摘要/要点/关键词查看。组件自管数据（App 传入的旧笔记 props 一律忽略）。
 */
export function NotesPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const stageTimersRef = useRef([]);
  const fileInputRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState(null);
  const [searchError, setSearchError] = useState("");

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.knowledgeDocuments()
      .then((result) => {
        if (cancelled) return;
        setDocuments(result.documents ?? []);
        setLoadError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError("知识库加载失败：" + error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    for (const timer of stageTimersRef.current) clearTimeout(timer);
  }, []);

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError("");
    setUploadResult(null);
  }

  async function handleUpload() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    setUploadStage("uploading");
    // 服务端一次请求内完成全部步骤，这里按节奏推进阶段提示，让进度可见
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [
      setTimeout(() => setUploadStage("parsing"), 500),
      setTimeout(() => setUploadStage("indexing"), 1400),
      setTimeout(() => setUploadStage("analyzing"), 2600),
    ];
    try {
      const result = await api.uploadKnowledgeDocument(selectedFile);
      const document = result.document;
      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      setUploadResult(document);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setUploadError(error.message);
    } finally {
      stageTimersRef.current.forEach(clearTimeout);
      stageTimersRef.current = [];
      setUploading(false);
      setUploadStage(null);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError("");
    try {
      const result = await api.searchKnowledge(query);
      setSearchHits(result.hits ?? []);
    } catch (error) {
      setSearchError("检索失败：" + error.message);
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchHits(null);
    setSearchError("");
  }

  function toggleExpanded(documentId) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }

  async function handleDelete(documentId) {
    if (deletingId) return;
    setDeletingId(documentId);
    try {
      await api.deleteKnowledgeDocument(documentId);
      setDocuments((current) => current.filter((item) => item.id !== documentId));
      setSearchHits((current) => (Array.isArray(current) ? current.filter((hit) => hit.documentId !== documentId) : current));
      setUploadResult((current) => (current?.id === documentId ? null : current));
      setConfirmingDeleteId(null);
    } catch (error) {
      setLoadError("删除失败：" + error.message);
    } finally {
      setDeletingId(null);
    }
  }

  const totalChunks = documents.reduce((sum, document) => sum + (document.chunkCount ?? 0), 0);

  return (
    <div className="kb-layout">
      <section className="section-panel kb-hero">
        <div>
          <span className="eyebrow">知识库 · LLMWiki</span>
          <h1>把课程资料建成可检索的个人知识库。</h1>
          <p>
            上传 TXT / MD / DOCX / PDF / PPTX 文件，系统自动解析正文、分块并建立全文索引，
            同时为每篇文档生成摘要、要点与关键词。
          </p>
        </div>
        <div className="kb-hero-stats">
          <div className="kb-hero-stat">
            <strong>{documents.length}</strong>
            <span>篇文档</span>
          </div>
          <div className="kb-hero-stat">
            <strong>{totalChunks}</strong>
            <span>个知识块</span>
          </div>
        </div>
      </section>

      <section className="section-panel kb-upload-panel">
        <div className="section-heading">
          <div>
            <h2>上传文档</h2>
            <small>解析正文 → 分块 → 全文索引 → 自动分析</small>
          </div>
        </div>
        <div className="kb-upload-zone">
          <input
            ref={fileInputRef}
            id="kb-file-input"
            className="kb-file-input"
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={handleFileChange}
            aria-label="选择要上传的文档"
          />
          <label className="kb-file-label" htmlFor="kb-file-input">
            <span className="kb-file-label-icon" aria-hidden="true">＋</span>
            {selectedFile ? selectedFile.name : "选择文件（TXT / MD / DOCX / PDF / PPTX）"}
          </label>
          <button
            className="primary-button kb-upload-submit"
            type="button"
            disabled={!selectedFile || uploading}
            onClick={handleUpload}
          >
            {uploading ? "正在处理…" : "上传并分析"}
          </button>
        </div>
        {uploading ? (
          <ol className="kb-stage-list" aria-label="处理进度">
            {UPLOAD_STAGES.map((stage) => {
              const currentIndex = UPLOAD_STAGES.findIndex((item) => item.id === uploadStage);
              const stageIndex = UPLOAD_STAGES.findIndex((item) => item.id === stage.id);
              const state = stageIndex < currentIndex ? "done" : stageIndex === currentIndex ? "active" : "pending";
              return (
                <li key={stage.id} className={`kb-stage ${state}`}>
                  <span className="kb-stage-dot" aria-hidden="true" />
                  {stage.label}
                </li>
              );
            })}
          </ol>
        ) : null}
        {uploadError ? <p className="kb-error" role="alert">{uploadError}</p> : null}
        {uploadResult ? (
          <div className="kb-upload-result" data-testid="kb-upload-result">
            <div className="kb-upload-result-head">
              <strong>✓ 已入库：{uploadResult.title}</strong>
              <span className={uploadResult.analysisSource === "ai" ? "kb-badge ai" : "kb-badge"}>
                {uploadResult.analysisSource === "ai" ? "AI 分析" : "本地分析"}
              </span>
            </div>
            <p>{uploadResult.analysis?.summary}</p>
            <div className="kb-meta-row">
              <span>{uploadResult.chunkCount} 个知识块</span>
              <span>{uploadResult.charCount} 字</span>
            </div>
            {uploadResult.analysis?.keywords?.length ? (
              <div className="kb-keyword-row">
                {uploadResult.analysis.keywords.map((keyword) => (
                  <span className="kb-keyword-chip" key={keyword}>{keyword}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="section-panel kb-search-panel">
        <div className="section-heading">
          <div>
            <h2>全文检索</h2>
            <small>在所有已入库文档的知识块中查找</small>
          </div>
        </div>
        <form className="kb-search-bar" onSubmit={handleSearch}>
          <input
            className="kb-search-input"
            type="text"
            aria-label="知识库检索关键词"
            placeholder="输入关键词，如「缓存一致性」「流水线」…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button className="primary-button kb-search-submit" type="submit" disabled={searching || !searchQuery.trim()}>
            {searching ? "检索中…" : "检索"}
          </button>
          {searchHits !== null ? (
            <button className="ghost-button" type="button" onClick={clearSearch}>清除</button>
          ) : null}
        </form>
        {searchError ? <p className="kb-error" role="alert">{searchError}</p> : null}
        {searchHits !== null ? (
          searchHits.length === 0 ? (
            <div className="empty-state">
              <p>没有命中「{searchQuery}」的知识块，换个关键词试试。</p>
            </div>
          ) : (
            <div className="kb-hit-list">
              <small className="kb-hit-count">命中 {searchHits.length} 个知识块</small>
              {searchHits.map((hit) => (
                <article className="kb-hit-card" key={hit.chunkId}>
                  <header>
                    <strong>{hit.documentTitle}</strong>
                    <span className="kb-hit-loc">
                      {hit.pageNo != null ? `第 ${hit.pageNo} 页 · ` : ""}第 {hit.chunkIndex + 1} 块
                    </span>
                  </header>
                  <p className="kb-snippet"><HighlightedSnippet text={hit.snippet} /></p>
                  {hit.relatedPoint ? (
                    <small className="kb-hit-point">关联要点：{hit.relatedPoint}</small>
                  ) : null}
                </article>
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="section-panel kb-documents-panel">
        <div className="section-heading">
          <div>
            <h2>我的文档</h2>
            <small>{documents.length} 篇</small>
          </div>
        </div>
        {loadError ? <p className="kb-error" role="alert">{loadError}</p> : null}
        {loading ? (
          <div className="empty-state"><p>正在加载知识库…</p></div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <strong>知识库还是空的</strong>
            <p>上传第一份课程资料（讲义、复习提纲、实验报告都可以），系统会自动生成摘要与关键词。</p>
          </div>
        ) : (
          <div className="kb-doc-list">
            {documents.map((document) => {
              const expanded = expandedIds.has(document.id);
              const keyPoints = document.analysis?.keyPoints ?? [];
              return (
                <article className="kb-doc-card" key={document.id}>
                  <header className="kb-doc-head">
                    <span className="kb-badge type">{FILE_TYPE_LABELS[document.fileType] ?? document.fileType}</span>
                    <strong className="kb-doc-title">{document.title}</strong>
                    <span className={document.analysisSource === "ai" ? "kb-badge ai" : "kb-badge"}>
                      {document.analysisSource === "ai" ? "AI 分析" : "本地分析"}
                    </span>
                  </header>
                  <div className="kb-meta-row">
                    <span>{document.chunkCount} 块</span>
                    <span>{document.charCount} 字</span>
                    <span>{formatFileSize(document.fileSize)}</span>
                    <span>{formatKbDate(document.createdAt)}</span>
                  </div>
                  {document.analysis?.summary ? (
                    <p className="kb-doc-summary">{document.analysis.summary}</p>
                  ) : null}
                  {document.analysis?.keywords?.length ? (
                    <div className="kb-keyword-row">
                      {document.analysis.keywords.map((keyword) => (
                        <span className="kb-keyword-chip" key={keyword}>{keyword}</span>
                      ))}
                    </div>
                  ) : null}
                  {keyPoints.length ? (
                    <div className="kb-points">
                      <button
                        className="ghost-button kb-points-toggle"
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleExpanded(document.id)}
                      >
                        {expanded ? "收起要点" : `展开 ${keyPoints.length} 条要点`}
                      </button>
                      {expanded ? (
                        <ol className="kb-points-list">
                          {keyPoints.map((point, index) => (
                            <li key={index}>{point}</li>
                          ))}
                        </ol>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="kb-doc-actions">
                    {confirmingDeleteId === document.id ? (
                      <>
                        <button
                          className="ghost-button danger kb-confirm-delete"
                          type="button"
                          disabled={deletingId === document.id}
                          onClick={() => handleDelete(document.id)}
                        >
                          {deletingId === document.id ? "正在删除…" : "确认删除（含索引）"}
                        </button>
                        <button className="ghost-button" type="button" onClick={() => setConfirmingDeleteId(null)}>取消</button>
                      </>
                    ) : (
                      <button
                        className="ghost-button danger kb-delete-button"
                        type="button"
                        onClick={() => setConfirmingDeleteId(document.id)}
                      >
                        删除
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
