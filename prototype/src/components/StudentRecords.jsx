import { useMemo } from "react";
import { CheckCircle, ClockCountdown, Flask, TreeStructure, TrendUp, WarningCircle } from "@phosphor-icons/react";
import { CHALLENGES } from "../platformLogic.js";
import { COURSE_CHAPTERS } from "../courseChapters.js";
import {
  buildChapterScoreSeries,
  buildLearningTreeModel,
  buildScreenKpis,
  buildStatusDistribution,
} from "../recordsScreenModel.js";
import { LearningTreeCanvas } from "./records/LearningTreeCanvas.jsx";
import { ChapterLitBars, ChapterScoreLine, StatusDonut } from "./records/TechCharts.jsx";
import { DemoPracticePanel } from "./records/DemoPracticePanel.jsx";
import "./records/recordsTech.css";

const CHALLENGES_BY_CHAPTER = COURSE_CHAPTERS.map((chapter) => ({
  chapter,
  items: CHALLENGES.filter((challenge) => challenge.chapterId === chapter.id),
})).filter((group) => group.items.length > 0);

function statusText(status) {
  return { completed: "已完成", "in-progress": "进行中", unlocked: "未开始", locked: "未解锁" }[status] ?? status;
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}小时${rest}分` : `${rest}分钟`;
}

export function StudentRecords({ summary, progress, activityLog, changeView, selectChallenge }) {
  const treeModel = useMemo(() => buildLearningTreeModel(progress), [progress]);
  const distribution = useMemo(() => buildStatusDistribution(progress), [progress]);
  const chapterSeries = useMemo(() => buildChapterScoreSeries(progress), [progress]);
  const kpis = useMemo(() => buildScreenKpis(summary, progress), [summary, progress]);

  if (summary.totalAttempts === 0) {
    return (
      <div className="records-screen">
        <section className="section-panel">
          <div className="section-heading">
            <h1>个人学情记录</h1>
          </div>
          <div className="empty-state">
            <Flask size={40} weight="duotone" />
            <strong>还没有学习记录</strong>
            <p>完成第一个实验关卡后，这里会用学习树和统计图展示你的完成率、得分和复习建议。</p>
            <button className="primary-button" onClick={() => changeView("home")} type="button">回到课程首页选择实验</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="records-screen">
      <header className="records-screen-header">
        <div>
          <h1>个人学情记录</h1>
          <p className="records-subtitle">学习树按教材章节生长——每完成一个实验，就点亮一根树杈。</p>
        </div>
        <div className="records-screen-actions">
          <a className="ghost-button" href="/api/student/report.md">导出实验报告</a>
          <button className="ghost-button" onClick={() => changeView("home")} type="button">回到课程首页继续实验</button>
        </div>
      </header>

      <section aria-label="学习总览指标" className="records-kpi-strip">
        <div className="records-kpi accent">
          <span>已点亮树杈</span>
          <strong>{kpis.lit}<small> / {kpis.total}</small></strong>
          <small>{kpis.inProgress} 个进行中</small>
        </div>
        <div className="records-kpi">
          <span>完成率</span>
          <strong>{kpis.completionRate}%</strong>
          <small>全部课程实验</small>
        </div>
        <div className="records-kpi">
          <span>平均得分</span>
          <strong>{kpis.averageScore}</strong>
          <small>逐关最佳成绩均值</small>
        </div>
        <div className="records-kpi">
          <span>累计学习</span>
          <strong>{formatMinutes(kpis.totalStudyMinutes)}</strong>
          <small>{kpis.totalAttempts} 次尝试</small>
        </div>
        <div className="records-kpi">
          <span>建议复习</span>
          <strong style={{ fontSize: 16 }}>{kpis.weakSpot}</strong>
          <small>高频错误类型</small>
        </div>
      </section>

      <div className="records-main-grid">
        <section aria-label="章节学习树" className="records-panel records-tree-panel">
          <div className="records-panel-head">
            <strong>
              <TreeStructure size={16} style={{ marginRight: 6, verticalAlign: "-3px" }} />
              章节学习树
            </strong>
            <small>树干 → 八章树枝 → 实验树杈</small>
          </div>
          <LearningTreeCanvas model={treeModel} onOpenChallenge={selectChallenge} />
        </section>

        <aside aria-label="学习情况统计" className="records-charts-column">
          <StatusDonut distribution={distribution} />
          <ChapterScoreLine series={chapterSeries} />
          <ChapterLitBars series={chapterSeries} />
          <DemoPracticePanel />
        </aside>
      </div>

      <section className="section-panel">
        <div className="section-heading">
          <div>
            <h2>关卡明细</h2>
            <p>按教材章节归组；点击可回到对应实验。</p>
          </div>
        </div>
        {CHALLENGES_BY_CHAPTER.map((group) => (
          <div className="record-chapter" key={group.chapter.id}>
            <h3 className="record-chapter-title">{group.chapter.title}</h3>
            <div className="record-table">
              {group.items.map((challenge) => {
                const record = progress[challenge.id] ?? {};
                return (
                  <button className="record-row" disabled={record?.status === "locked"} key={challenge.id} onClick={() => selectChallenge(challenge.id)} type="button">
                    <strong>{challenge.title}</strong>
                    <span>{statusText(record.status)}</span>
                    <span>{record.attempts ?? 0} 次尝试</span>
                    <span>{record.bestScore ?? 0} 分</span>
                    <small>{record.errors?.at(-1) ?? "暂无错误"}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="two-column">
        <article className="section-panel">
          <h2>最近活动</h2>
          <div className="activity-list">
            {activityLog.map((item) => (
              <div className="activity-item" key={item}>
                <CheckCircle size={18} weight="fill" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="section-panel">
          <h2>复习建议</h2>
          <p className="large-copy">优先复习「{summary.weakSpot}」。建议回到全加器实验，先运行动态演示，再补齐缺失连线。</p>
          <button className="primary-button" onClick={() => selectChallenge("full-adder")} type="button">
            <TrendUp size={17} /> 去复习全加器
          </button>
          <p className="large-copy" style={{ marginTop: 12 }}>
            <WarningCircle size={15} style={{ marginRight: 5, verticalAlign: "-2px" }} />
            也可以点击上方学习树中未点亮的树杈，直接回到对应实验。
            <ClockCountdown size={15} style={{ marginLeft: 5, verticalAlign: "-2px" }} />
          </p>
        </article>
      </section>
    </div>
  );
}
