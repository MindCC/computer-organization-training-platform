/**
 * platform-link.js — 演示页 ↔ 组成原理实训平台 学情联动（可选增强）
 *
 * - 平台内打开（同源 /demos/*.html）：自动识别登录学生，练习成绩按批（每 5 题）
 *   提交到 /api/student/demo-attempts，计入学情报告与学习记录面板；
 * - 独立使用（file:// 或无登录）：自动降级为独立模式，页面功能完全不受影响。
 *
 * 演示页只需在判分后调用：window.__platformLink?.recordQuizAnswer(isCorrect)
 */
(function () {
  "use strict";

  var PAGE_MAP = {
    "twos-complement.html": { id: "twos-complement", title: "补码的运算" },
    "arithmetic-basics.html": { id: "arithmetic-basics", title: "运算基础（补码与移位）" },
    "memory-system.html": { id: "memory-system", title: "存储器系统" },
    "addressing.html": { id: "addressing", title: "指令系统与寻址方式" },
    "cpu.html": { id: "cpu", title: "CPU 的结构与设计" },
    "bus.html": { id: "bus", title: "系统总线" },
    "io.html": { id: "io", title: "输入输出系统" },
  };

  var fileName = String(location.pathname.split("/").pop() || "").toLowerCase();
  var page = PAGE_MAP[fileName] || null;

  var link = {
    linked: false,
    demoId: page ? page.id : null,
    demoTitle: page ? page.title : null,
    user: null,
    batch: { answered: 0, correct: 0, startedAt: Date.now() },
    batchesSubmitted: 0,
    recordQuizAnswer: recordQuizAnswer,
    flush: flush,
  };
  window.__platformLink = link;

  function recordQuizAnswer(isCorrect) {
    link.batch.answered += 1;
    if (isCorrect) link.batch.correct += 1;
    if (link.linked && link.batch.answered >= 5) flush(false);
  }

  function flush(isFinal) {
    if (!link.linked || link.batch.answered === 0) return;
    var answered = link.batch.answered;
    var correct = link.batch.correct;
    var score = Math.round((correct / answered) * 100);
    link.batchesSubmitted += 1;
    var elapsedMinutes = Math.max(1, Math.round((Date.now() - link.batch.startedAt) / 60000));
    link.batch = { answered: 0, correct: 0, startedAt: Date.now() };
    var payload = {
      demoId: link.demoId,
      result: {
        score: score,
        total: answered,
        correct: correct,
        errors: [{ type: "课堂演示练习", message: link.demoTitle + " · 第 " + link.batchesSubmitted + " 批：" + correct + "/" + answered }],
        elapsedMinutes: elapsedMinutes,
      },
    };
    fetch("/api/student/demo-attempts", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (res.ok) renderBadge("已连接学情 · " + (link.user.displayName || link.user.username) + " · 已存 " + link.batchesSubmitted + " 批", true);
    }).catch(function () { /* 静默：不影响练习 */ });
    void isFinal;
  }

  function renderBadge(text, ok) {
    var el = document.getElementById("platform-link-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "platform-link-badge";
      el.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:9999;padding:6px 14px;border-radius:999px;font:700 12px/1.6 'Microsoft YaHei',sans-serif;letter-spacing:.04em;pointer-events:none;border:1px solid " + (ok ? "rgba(52,211,153,.55)" : "rgba(93,112,153,.55)") + ";color:" + (ok ? "#a7f3d0" : "#8ea3c8") + ";background:rgba(8,18,46,.85);box-shadow:0 4px 18px rgba(2,8,26,.5);";
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  function init() {
    if (!page || location.protocol === "file:") {
      renderBadge("独立模式 · 练习成绩仅本页保留", false);
      return;
    }
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        if (body && body.user && body.user.role === "student") {
          link.linked = true;
          link.user = body.user;
          renderBadge("已连接学情 · " + (body.user.displayName || body.user.username), true);
        } else {
          renderBadge("独立模式 · 练习成绩仅本页保留", false);
        }
      })
      .catch(function () { renderBadge("独立模式 · 练习成绩仅本页保留", false); });
  }

  window.addEventListener("pagehide", function () { flush(true); });
  window.addEventListener("beforeunload", function () { flush(true); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
