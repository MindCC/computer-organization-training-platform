import { useState } from 'react';
import { COURSE_CHAPTERS } from '../../courseChapters.js';
import { StudyCompanion } from './StudyCompanion.jsx';
import './aiAssistantPage.css';

export function AiAssistantPage({ userId, readOnly }) {
  const [chapterId, setChapterId] = useState('ch1');
  const chapter = COURSE_CHAPTERS.find(item => item.id === chapterId);
  return <div className="ai-assistant-page">
      <StudyCompanion key={chapterId} embedded userId={userId} readOnly={readOnly} page={`ai-assistant:${chapterId}`} pageTitle={chapter.title} chapterId={chapterId} sidebar={<>
        <header className="ai-assistant-heading"><span className="eyebrow">小芯 · 课程答疑</span><h1>AI助教</h1></header>
        <label htmlFor="assistant-chapter">本次答疑章节</label>
        <select id="assistant-chapter" value={chapterId} onChange={event => setChapterId(event.target.value)}>{COURSE_CHAPTERS.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
      </>} suggestions={[`请帮我梳理“${chapter.title}”的关键知识点。`, `学习“${chapter.title}”时，哪些概念容易混淆？`]} />
  </div>;
}
