import { ArrowRight, Link } from '@phosphor-icons/react';
import '../taskChain.css';

export function TaskChainBar({viewModel,onContinue}) {
  if(!viewModel.active||viewModel.mission?.key!=='task-chain')return null;
  const total=viewModel.mission.stages.length;
  return <aside className="task-chain-bar" aria-label="课堂任务导航"><Link size={21}/><div><small>{viewModel.title} · 已完成 {viewModel.stageIndex} / {total}</small><strong>{viewModel.ended?'课堂已结束':viewModel.studentStatus==='completed'?'任务链已完成':viewModel.currentStage?.title}</strong></div>{viewModel.paused&&<span>教师已暂停课堂</span>}<button type="button" className="primary-button" onClick={onContinue}>回到课堂任务<ArrowRight size={15}/></button></aside>;
}
