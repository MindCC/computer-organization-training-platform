import { knowledgePointOf, knowledgePointsForChallenge } from '../knowledgePoints.js';

export function taskStageKnowledgeIds(stage,mission={}) {
  const ids=stage?.knowledgePointIds??(stage?.type==='lab'?knowledgePointsForChallenge(stage.challengeId).map(point=>point.id):(mission.knowledgePointIds??[]).filter(id=>!stage?.chapterId||knowledgePointOf(id)?.chapterId===stage.chapterId));
  return [...new Set(ids.map(id=>knowledgePointOf(id)?.id).filter(Boolean))];
}
