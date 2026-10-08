import { knowledgePointOf } from '../../knowledgePoints.js';
import { taskStageKnowledgeIds } from '../../shared/taskStageKnowledge.js';

export function TaskStageKnowledge({stage,mission,ids}) {
  const points=[...new Map((ids??taskStageKnowledgeIds(stage,mission)).map(knowledgePointOf).filter(Boolean).map(point=>[point.id,point])).values()];
  return <aside className="chain-current-knowledge" aria-label="当前讲解知识点"><strong>当前讲解知识点</strong><div>{points.length?points.map(point=><span key={point.id}>{point.title}</span>):<small>本环节尚未指定知识点</small>}</div></aside>;
}
