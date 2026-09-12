import { CheckCircle, Target, TrendUp, WarningCircle } from "@phosphor-icons/react";
import { hardwareCaseTitle, formatHardwareBuildParts } from "../../hardwareGame.js";

function Metric({ icon: Icon, label, value }) {
  return <article className="metric-card"><Icon size={24} weight="fill" /><span>{label}</span><strong>{value}</strong></article>;
}

/** 班级学情指标 + 硬件配置挑战汇总。 */
export function TeacherClassSummary({ classOverview, students, hardwareSummary }) {
  const summary = classOverview?.summary ?? {};
  return (
    <>
      <div className="teacher-studio-summary">
        <Metric icon={CheckCircle} label="学生数" value={summary.studentCount ?? students.length} />
        <Metric icon={Target} label="平均完成率" value={`${summary.completionRate ?? 0}%`} />
        <Metric icon={TrendUp} label="平均分" value={summary.averageScore ?? 0} />
        <Metric icon={WarningCircle} label="高频问题" value={summary.weakSpot ?? "暂无数据"} />
      </div>

      <div className="hardware-teacher-summary">
        <div className="hardware-teacher-block">
          <strong>硬件挑战：完成</strong>
          <span>{hardwareSummary.completedCases ?? 0} 个案例 · 均分 {hardwareSummary.averageScore ?? 0}</span>
        </div>
        <div className="hardware-teacher-list">
          <strong>常见瓶颈</strong>
          {hardwareSummary.frequentBottlenecks.length
            ? hardwareSummary.frequentBottlenecks.map((bottleneck) => <span key={bottleneck.key}>{bottleneck.label}</span>)
            : <p className="empty-state">暂无游戏提交数据</p>}
        </div>
        <div className="hardware-teacher-list">
          <strong>典型高分配置</strong>
          {hardwareSummary.typicalBuilds.length
            ? hardwareSummary.typicalBuilds.slice(0, 3).map((build) => (
                <span key={build.caseId}>{hardwareCaseTitle(build.caseId)} · {build.score}<small>{formatHardwareBuildParts(build.parts)}</small></span>
              ))
            : <p className="empty-state">暂无高分配置</p>}
        </div>
      </div>
    </>
  );
}
