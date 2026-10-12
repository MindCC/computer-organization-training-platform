import './studyRecommendations.css';

export function StudySpark({spark,compact=false}) {
  if(!spark)return null;
  return <section className={`study-spark ${compact?'compact':''}`} aria-label="学习火花" data-testid="study-spark">
    <div className="study-spark-mark" aria-hidden="true">✦</div>
    <div><strong>小芯 · {spark.level}</strong><p className="study-spark-metrics"><span>今日 +{spark.todayPoints} ／ 10</span><span>连续有效学习 {spark.streak} 天</span></p>
      {!compact&&<><p>累计 {spark.totalPoints} 火花 · {spark.breakthroughs} 个知识点首次复测通过</p>
      <p className="study-spark-note">火花记录学习投入；知识掌握需要答题和复测证据。</p></>}
      <details><summary>火花怎么点亮</summary><p>{spark.rules}</p>{spark.nextLevelAt&&<p>累计 {spark.nextLevelAt} 火花进入下一陪伴阶段。</p>}</details>
    </div>
  </section>;
}
