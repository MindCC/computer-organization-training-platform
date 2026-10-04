import { useMemo } from "react";
import { ArrowRight, ChartBar, TreeStructure } from "@phosphor-icons/react";
import { CHALLENGES } from "../platformLogic.js";
import { COURSE_CHAPTERS, PARTICIPATION_SCORE_NOTE, isParticipationChallenge, scoreLabelOf } from "../courseChapters.js";
import {
  buildChapterScoreSeries,
  buildLearningTreeModel,
  buildScreenKpis,
  buildStatusDistribution,
} from "../recordsScreenModel.js";
import { LearningTreeCanvas } from "./records/LearningTreeCanvas.jsx";
import { ChapterLitBars, ChapterScoreLine, ChapterStudyTimeChart, StatusDonut, TopErrorsChart } from "./records/TechCharts.jsx";
import { DemoPracticePanel } from "./records/DemoPracticePanel.jsx";
import { ZoomableChart } from "./records/ChartZoomModal.jsx";
import { RecordsCalendar } from "./records/RecordsCalendar.jsx";
import { PomodoroPanel } from "./records/PomodoroPanel.jsx";
import { LearningWorkspace } from "./learning/LearningWorkspace.jsx";
import { ShopServiceRecords } from './records/ShopServiceRecords.jsx';
import { RecentActivityChart } from "./records/RecentActivityChart.jsx";
import { buildRecentActivityModel } from "../recordsOverviewModel.js";
import { StudyMascot } from "./ai/StudyMascot.jsx";
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

function errorLabelOf(error) {
  if (typeof error === "string") return error;
  return error?.type ?? error?.message ?? String(error);
}

function DisclosureToggle() {
  return <span className="records-disclosure-toggle"><span className="when-closed">展开</span><span className="when-open">收起</span></span>;
}

export function StudentRecords({ summary = {}, progress = {}, activityLog = [], changeView, selectChallenge, openStudyTarget, userId, reviewData, assistantEnabled = true }) {
  const treeModel = useMemo(() => buildLearningTreeModel(progress), [progress]);
  const distribution = useMemo(() => buildStatusDistribution(progress), [progress]);
  const chapterSeries = useMemo(() => buildChapterScoreSeries(progress), [progress]);
  const kpis = useMemo(() => buildScreenKpis(summary, progress), [summary, progress]);
  const activityModel = useMemo(() => buildRecentActivityModel(activityLog, progress, { limit: 5 }), [activityLog, progress]);
  const reviewChallenge=CHALLENGES.find(challenge=>progress[challenge.id]?.status==='in-progress')??CHALLENGES.find(challenge=>progress[challenge.id]?.status==='unlocked');
  const hasGradedScore = chapterSeries.some(chapter => chapter.scoredCount > 0);
  const hasWeakSpot = Boolean(summary.weakSpot && summary.weakSpot !== "暂无高频错误");
  const reviewSuggestion = `${hasWeakSpot ? `优先复习「${summary.weakSpot}」。` : "目前没有高频错误记录。"}${reviewChallenge ? `建议继续「${reviewChallenge.title}」，对照实际检测反馈补齐遗漏。` : "可以回看已完成关卡，或到错题本巩固题库与作业。"}`;
  const topErrors = useMemo(() => {
    const counts = new Map();
    for (const record of Object.values(progress ?? {})) {
      for (const error of record?.errors ?? []) {
        const label = errorLabelOf(error);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN"));
  }, [progress]);

  return (
    <div className="records-screen">
      <header className="records-screen-header">
        <div>
          <h1>个人学情记录</h1>
          <p className="records-subtitle">整理知识联系，查看自己的学习进度；课程地图已移至课程首页。</p>
        </div>
        <div className="records-screen-actions">
          <a className="ghost-button" href="/api/student/report.md">导出实验报告</a>
          <button className="ghost-button" onClick={() => changeView("home")} type="button">回到课程首页继续实验</button>
        </div>
      </header>

      <LearningWorkspace userId={userId} progress={progress} onOpenChallenge={selectChallenge} onOpenStudyTarget={openStudyTarget} />

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
          <strong className={!hasGradedScore ? "records-kpi-empty" : undefined}>{hasGradedScore ? kpis.averageScore : "暂无成绩"}</strong>
          <small>已完成实验均分 · 参与型不计分</small>
        </div>
        <div className="records-kpi">
          <span>累计学习</span>
          <strong>{formatMinutes(kpis.totalStudyMinutes)}</strong>
          <small>{kpis.totalAttempts} 次尝试</small>
        </div>
        <div className="records-kpi records-kpi-review">
          <div className="records-review-label"><span>建议复习</span>{assistantEnabled && <StudyMascot compact context={{ source: "records", chapterId: reviewChallenge?.chapterId }} suggestion={reviewSuggestion} />}</div>
          <strong className="records-review-topic" title={reviewSuggestion}>{hasWeakSpot ? kpis.weakSpot : "继续当前探索"}</strong>
          <button className="records-review-action" type="button" onClick={() => reviewChallenge ? selectChallenge(reviewChallenge.id) : changeView("mistakes")}>{reviewChallenge ? `继续${reviewChallenge.shortTitle ?? reviewChallenge.title}` : "打开错题本"}<ArrowRight size={13} /></button>
        </div>
      </section>

      {/* 番茄钟：自习节奏工具，状态跨页面/刷新保留 */}
      <PomodoroPanel />

      {/* 学习日历：按天回看实验与课堂演示记录 */}
      <RecordsCalendar onOpenChallenge={selectChallenge} />

      <section className="records-statistics" aria-labelledby="records-statistics-title">
        <div className="records-section-heading">
          <div><h2 id="records-statistics-title"><ChartBar size={18} />学习统计</h2><p>{kpis.totalAttempts > 0 ? "真实实验记录概览，点击任一图表可展开查看。" : "尚无实验提交记录。从课程首页开始探索，检测结果会自动汇总到这里。"}</p></div>
          <small>六项概览 · 同步当前学习记录</small>
        </div>
        <div aria-label="学习情况统计" className="records-charts-column" data-testid="records-statistics-grid">
          <ZoomableChart title="树杈点亮分布"><StatusDonut distribution={distribution} /></ZoomableChart>
          <ZoomableChart title="各章得分与点亮率"><ChapterScoreLine series={chapterSeries} /></ZoomableChart>
          <ZoomableChart title="章节点亮进度"><ChapterLitBars series={chapterSeries} /></ZoomableChart>
          <ZoomableChart title="各章累计学习时长"><ChapterStudyTimeChart series={chapterSeries} /></ZoomableChart>
          <ZoomableChart title="高频错误 Top"><TopErrorsChart errors={topErrors} /></ZoomableChart>
          <ZoomableChart title="最近学习活动"><RecentActivityChart model={activityModel} /></ZoomableChart>
        </div>
      </section>

      <details className="records-disclosure" data-testid="records-tree-section">
        <summary className="records-disclosure-summary"><span className="records-disclosure-copy"><strong>章节学习树</strong><small>查看八章分支与全部 {treeModel.totals.total} 个实验叶片</small></span><span className="records-disclosure-meta">{treeModel.totals.lit} 已点亮<DisclosureToggle /></span></summary>
        <section aria-label="章节学习树" className="records-panel records-tree-panel">
          <div className="records-panel-head">
            <strong>
              <TreeStructure size={16} style={{ marginRight: 6, verticalAlign: "-3px" }} />
              章节学习树
            </strong>
            <small>{treeModel.chapters.length} 个章节 · {treeModel.totals.total} 个实验</small>
          </div>
          <LearningTreeCanvas model={treeModel} onOpenChallenge={selectChallenge} />
        </section>

      </details>

      <details className="records-disclosure" data-testid="records-details-section">
        <summary className="records-disclosure-summary"><span className="records-disclosure-copy"><strong>关卡明细</strong><small>按教材章节查看尝试次数、成绩与检测反馈</small></span><span className="records-disclosure-meta">{CHALLENGES.length} 个电路实验<DisclosureToggle /></span></summary>
        <section className="section-panel records-detail-panel">
        <div className="section-heading">
          <div>
            <h2>关卡明细</h2>
            <p>按教材章节归组，点击章节标题可展开/收起；点击关卡可回到对应实验。"参与型"实验完成即通过，不计分。</p>
          </div>
        </div>
        {CHALLENGES_BY_CHAPTER.map((group, index) => {
          const litCount = group.items.filter((challenge) => progress[challenge.id]?.status === "completed").length;
          return (
            <details className="record-chapter" key={group.chapter.id} open={index === 0}>
              <summary className="record-chapter-summary">
                <h3 className="record-chapter-title">{group.chapter.title}</h3>
                <span className="record-chapter-meta">{litCount}/{group.items.length} 点亮 · {group.items.length} 个实验</span>
              </summary>
              <div className="record-table">
                {group.items.map((challenge) => {
                  const record = progress[challenge.id] ?? {};
                  return (
                    <button className="record-row" key={challenge.id} onClick={() => selectChallenge(challenge.id)} title={record?.status === "locked" ? "尚未解锁：可以进去练习，解锁后才能提交检测" : undefined} type="button">
                      <strong>{challenge.title}</strong>
                      <span>{statusText(record.status)}</span>
                      <span>{record.attempts ?? 0} 次尝试</span>
                      <span title={isParticipationChallenge(challenge) ? PARTICIPATION_SCORE_NOTE : undefined}>{scoreLabelOf(challenge, record)}</span>
                      <small>{record.errors?.length ? errorLabelOf(record.errors.at(-1)) : "暂无错误"}</small>
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })}
        </section>
      </details>

      <details className="records-disclosure" data-testid="records-practice-section">
        <summary className="records-disclosure-summary"><span className="records-disclosure-copy"><strong>课堂练习与维修记录</strong><small>章节演示随堂成绩，以及装机店的诊断、升级和复测结果</small></span><span className="records-disclosure-meta"><DisclosureToggle /></span></summary>
        <div className="records-secondary-grid">
          <DemoPracticePanel userId={userId} suppliedDemos={reviewData?.demos} onOpenCourse={() => changeView("courseware")} />
          <ShopServiceRecords suppliedRecords={reviewData?.serviceRecords} openStudyTarget={openStudyTarget}/>
        </div>
      </details>
    </div>
  );
}
