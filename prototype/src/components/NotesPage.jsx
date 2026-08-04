import { CHALLENGES } from "../platformLogic.js";
import studyDiagram from "../assets/study-tip-carry-diagram.webp";

export function NotesPage({
  noteDraft,
  setNoteDraft,
  noteError,
  filteredNotes,
  noteSearchQuery,
  setNoteSearchQuery,
  noteFilterTag,
  setNoteFilterTag,
  noteTags,
  editingNoteId,
  editingNoteDraft,
  setEditingNoteDraft,
  currentChallenge,
  saveNote,
  deleteNoteById,
  startEditingNote,
  cancelEditingNote,
  saveNoteEdit,
}) {
  return (
    <div className="notes-layout">
      <section className="section-panel note-editor">
        <span className="eyebrow">学习笔记</span>
        <h1>把实验复盘沉淀下来。</h1>
        <textarea
          aria-label="笔记内容"
          onChange={(event) => setNoteDraft(event.target.value)}
          value={noteDraft}
        />
        <div className="note-actions">
          <button className="primary-button" onClick={saveNote} type="button">保存笔记</button>
          <button
            className="ghost-button"
            onClick={() => setNoteDraft(`${currentChallenge.title}：${currentChallenge.principle}`)}
            type="button"
          >
            插入当前原理
          </button>
        </div>
        {noteError ? <p className="note-error">{noteError}</p> : null}
      </section>

      <section className="section-panel">
        <div className="section-heading">
          <div>
            <h2>已保存笔记</h2>
            <small>{filteredNotes.length} 条{noteSearchQuery || noteFilterTag ? "（已筛选）" : ""}</small>
          </div>
        </div>
        <div className="note-toolbar">
          <input
            className="note-search-input"
            type="text"
            placeholder="搜索标题、内容或标签..."
            value={noteSearchQuery}
            onChange={(e) => setNoteSearchQuery(e.target.value)}
          />
          {noteTags.length > 1 ? (
            <select
              className="note-filter-select"
              value={noteFilterTag}
              onChange={(e) => setNoteFilterTag(e.target.value)}
            >
              <option value="">全部标签</option>
              {noteTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          ) : null}
        </div>
        {filteredNotes.length === 0 ? (
          <div className="empty-state">
            {noteSearchQuery || noteFilterTag ? (
              <p>没有匹配的笔记，试试修改搜索条件。</p>
            ) : (
              <>
                <strong>还没有学习笔记</strong>
                <p>在实验过程中点击「记笔记」可以记录你的发现。</p>
              </>
            )}
          </div>
        ) : (
          <div className="note-list">
            {filteredNotes.map((note) => (
              <article className={editingNoteId === note.id ? "note-card editing" : "note-card"} key={note.id}>
                {editingNoteId === note.id ? (
                  <div className="note-edit-form">
                    <input
                      className="note-edit-title"
                      value={editingNoteDraft.title}
                      onChange={(e) => setEditingNoteDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="笔记标题"
                    />
                    <textarea
                      className="note-edit-content"
                      value={editingNoteDraft.content}
                      onChange={(e) => setEditingNoteDraft((d) => ({ ...d, content: e.target.value }))}
                    />
                    <input
                      className="note-edit-tag"
                      value={editingNoteDraft.tag}
                      onChange={(e) => setEditingNoteDraft((d) => ({ ...d, tag: e.target.value }))}
                      placeholder="标签"
                    />
                    <div className="note-edit-actions">
                      <button className="primary-button" onClick={saveNoteEdit} type="button">保存</button>
                      <button className="ghost-button" onClick={cancelEditingNote} type="button">取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="note-card-header">
                      <span className="note-tag">{note.tag}</span>
                      <strong>{note.title}</strong>
                    </div>
                    <p>{note.content}</p>
                    {note.challengeId ? (
                      <small className="note-challenge-link">
                        关联关卡：{CHALLENGES.find((c) => c.id === note.challengeId)?.title ?? note.challengeId}
                      </small>
                    ) : null}
                    <div className="note-card-actions">
                      <button className="ghost-button" onClick={() => startEditingNote(note)} type="button">编辑</button>
                      <button className="ghost-button danger" onClick={() => deleteNoteById(note.id)} type="button">删除</button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section-panel study-tip">
        <div>
          <span className="eyebrow">概念卡片</span>
          <h2>二进制加法的核心是进位传播。</h2>
          <p>每个全加器只处理 1 位，但 Cout 会成为下一位的 Cin。多位加法器就是把这个动作串起来。</p>
        </div>
        <img alt="进位传播示意图" src={studyDiagram} />
      </section>
    </div>
  );
}
