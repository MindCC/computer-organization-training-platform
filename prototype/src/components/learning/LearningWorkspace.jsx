import { lazy, Suspense, useState } from 'react';
import './learningWorkspace.css';

const KnowledgeGraph = lazy(() => import('../KnowledgeGraph.jsx').then(module => ({ default: module.KnowledgeGraph })));

export function LearningWorkspace({ progress, onOpenChallenge, onOpenStudyTarget }) {
  const [focusId, setFocusId] = useState(null);
  return (
    <section className="learning-workspace" aria-label="课程知识图谱">
      <header className="learning-workspace-head">
        <div>
          <small>COURSE ATLAS / 计算机组成原理</small>
          <h2>课程知识图谱</h2>
          <p>梳理八章概念与联系，查看对应实验和练习。</p>
        </div>
      </header>
      <div>
        <Suspense fallback={<p className="learning-workspace-loading" role="status">正在展开课程知识图谱…</p>}>
          <KnowledgeGraph progress={progress} focusId={focusId} onSelectKp={setFocusId} onEnterChallenge={onOpenChallenge} onPickQuestion={question => onOpenStudyTarget?.({ source: 'practice', origin: 'knowledge', chapterId: question.chapterId, questionId: question.id })} />
        </Suspense>
      </div>
    </section>
  );
}
