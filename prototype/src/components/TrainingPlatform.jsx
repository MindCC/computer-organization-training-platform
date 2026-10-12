import { ArrowRight, Cpu, Circuitry, CheckCircle } from '@phosphor-icons/react';
import { ExperimentThumbnail } from './ExperimentThumbnail.jsx';
import './trainingPlatform.css';

export function TrainingPlatform({ routeGroups, navigateToChallenge, onOpenHardware }) {
  const chapters = routeGroups.map(group => ({ ...group, items: group.items.filter(item => !item.id.startsWith('game-')) }));
  const experiments = chapters.flatMap(group => group.items);
  const completed = experiments.filter(item => item.status === 'completed').length;
  const hardware = routeGroups.flatMap(group => group.items).filter(item => item.id.startsWith('game-'));
  return <div className="training-platform">
    <header className="training-heading">
      <span className="eyebrow">计算机组成原理 · 动手实践</span>
      <h1>实训平台</h1>
      <p>从整机装配到电路与数据通路，选择实训项目，在操作中验证所学原理。</p>
    </header>
    <section className="training-hardware" aria-labelledby="training-hardware-title">
      <div className="training-hardware-image"><ExperimentThumbnail challengeId="game-student-pc" /></div>
      <div className="training-hardware-content">
        <span className="eyebrow"><Cpu size={18} /> 硬件实训</span>
        <h2 id="training-hardware-title">硬件互动装机</h2>
        <p>走进装机店，分析客户需求、选择配置，完成 3D 装配、接线和开机自检。</p>
        <small>配置挑战已完成 {hardware.filter(item => item.status === 'completed').length} / {hardware.length}</small>
        <button type="button" className="primary-button" onClick={onOpenHardware}>进入硬件互动装机 <ArrowRight size={18} /></button>
      </div>
    </section>
    <section aria-labelledby="training-experiments-title">
      <header className="training-section-heading"><h2 id="training-experiments-title"><Circuitry size={22} /> 章节实验</h2><span>已完成 {completed} / {experiments.length}</span></header>
      <div className="training-chapters">
        {chapters.map(chapter => <article className="training-chapter" key={chapter.id}>
          <header><h3>{chapter.title}</h3><span>{chapter.items.filter(item => item.status === 'completed').length} / {chapter.items.length}</span></header>
          <p>{chapter.description}</p>
          <div className="training-experiments">{chapter.items.map(item => <button type="button" className="training-experiment" key={item.id} onClick={() => navigateToChallenge(item.id)}>
            <ExperimentThumbnail challengeId={item.id} />
            <span><strong>{item.title}</strong><small>{item.estimatedLabel} · {item.statusLabel}{item.scored ? ` · ${item.scoreLabel}` : ''}</small></span>
            {item.status === 'completed' ? <CheckCircle size={20} className="training-completed" /> : <ArrowRight size={18} />}
          </button>)}</div>
        </article>)}
      </div>
    </section>
  </div>;
}
