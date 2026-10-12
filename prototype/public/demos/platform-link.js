/**
 * platform-link.js — 演示页 ↔ 组成原理实训平台 学情联动（可选增强）
 *
 * - 平台内打开（同源 /demos/*.html）：识别当前账号，保存每题快照与可见学习时间
 *   提交到 /api/student/demo-attempts，计入学情报告与学习记录面板；
 * - 独立使用（file:// 或无登录）：自动降级为独立模式，页面功能完全不受影响。
 *
 * 判分后调用 recordQuizAnswer(isCorrect, question, originalAnswer)。独立页不依赖平台。
 */
(function () {
  "use strict";

  var PAGE_MAP = {
    "intro.html": { id: "intro", title: "计算机系统组成与冯·诺依曼结构" },
    "twos-complement.html": { id: "twos-complement", title: "补码的运算" },
    "arithmetic-basics.html": { id: "arithmetic-basics", title: "运算基础（补码与移位）" },
    "memory-system.html": { id: "memory-system", title: "存储器系统" },
    "addressing.html": { id: "addressing", title: "指令系统与寻址方式" },
    "cpu.html": { id: "cpu", title: "CPU 的结构与设计" },
    "bus.html": { id: "bus", title: "系统总线" },
    "io.html": { id: "io", title: "输入输出系统" },
    "alu.html": { id: "alu", title: "定点乘除与浮点运算" },
    "adder-alu.html": { id: "adder-alu", title: "半加器、全加器与运算器" },
  };

  var fileName = String(location.pathname.split("/").pop() || "").toLowerCase();
  var page = PAGE_MAP[fileName] || null;

  var link = {
    linked: false,
    demoId: page ? page.id : null,
    demoTitle: page ? page.title : null,
    user: null,
    batchesSubmitted: 0,
    recordQuizAnswer: recordQuizAnswer,
    recordQuestionShown: recordQuestionShown,
    flush: flush,
  };
  window.__platformLink = link;
  var pending = [], sending = false, storageKey = null;
  var activeMilliseconds = 0, lastTick = Date.now(), lastInteraction = Date.now();
  var visible = !document.hidden, inViewport = true;
  var IDLE_MS = 5 * 60000;
  var quizObservation = null, quizObserver = null;

  function recordQuestionShown(question, element) {
    if(quizObserver)quizObserver.disconnect();
    quizObservation={stem:plain(question.prompt || question.question),active:0,first:null,changes:0,visible:false,ended:false,last:Date.now()};
    if(element && typeof IntersectionObserver==='function') {
      quizObserver=new IntersectionObserver(function(entries){tick();quizObservation.visible=entries[0].isIntersecting;},{threshold:0.1});
      quizObserver.observe(element);
    }
  }
  function noteQuizInput(event) {
    if(!quizObservation || quizObservation.ended || !event.target || !event.target.closest)return;
    var selector=event.type==='input'?'#quizAnswer input':'#quizAnswer .quiz-choice,#quizChoices .quiz-choice,#quiz-options button,#quizAnswer .quiz-bit';
    if(!event.target.closest(selector))return;
    tick();if(quizObservation.first===null)quizObservation.first=Math.round(quizObservation.active);quizObservation.changes++;
  }
  document.addEventListener('click',noteQuizInput,true);
  document.addEventListener('input',noteQuizInput,true);

  function plain(value) {
    var el = document.createElement('div');
    el.innerHTML = String(value == null ? '' : value);
    return (el.textContent || '').trim().slice(0, 2000);
  }
  function tick() {
    var now = Date.now();
    if (link.linked && visible && inViewport) activeMilliseconds += Math.max(0, Math.min(now, lastInteraction + IDLE_MS) - lastTick);
    if(quizObservation) {
      if(link.linked&&visible&&inViewport&&quizObservation.visible&&!quizObservation.ended)quizObservation.active+=Math.max(0,Math.min(now,lastInteraction+IDLE_MS)-quizObservation.last);
      quizObservation.last=now;
    }
    lastTick = now;
  }
  function persist() {
    if (!storageKey) return;
    try { pending.forEach(function(p) { localStorage.setItem(storageKey + p.clientSubmissionId, JSON.stringify(p)); }); } catch (_) { /* 当前页面仍可重试 */ }
  }
  function enqueue(questions) {
    tick();
    if (!link.linked || (!questions.length && activeMilliseconds < 1000)) return;
    var milliseconds = Math.min(activeMilliseconds, 240 * 60000);
    activeMilliseconds -= milliseconds;
    var correct = questions.filter(function(q) { return q.correct; }).length;
    pending.push({demoId:link.demoId, accountId:link.user.id,
      clientSubmissionId: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'demo-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      result:{score:questions.length ? Math.round(correct / questions.length * 100) : 0,total:questions.length,correct:correct,questions:questions,errors:[],elapsedMinutes:milliseconds / 60000}});
    persist();
  }
  function recordQuizAnswer(isCorrect, question, originalAnswer) {
    if (!link.linked || !question) return;
    var reference = question.answer;
    if (Array.isArray(question.choices)) {
      originalAnswer = question.choices[originalAnswer];
      reference = question.choices[question.answer];
    }
    if (Array.isArray(originalAnswer)) originalAnswer = originalAnswer.join('');
    if (Array.isArray(reference)) reference = reference.join('');
    tick();
    var snapshot={stem:plain(question.prompt || question.question),studentAnswer:plain(originalAnswer),referenceAnswer:plain(reference),explanation:plain(question.explain || ''),correct:Boolean(isCorrect)};
    if(quizObservation&&!quizObservation.ended&&quizObservation.stem===snapshot.stem) {
      snapshot.observation={visibleActiveMs:Math.min(86400000,Math.round(quizObservation.active)),firstAnswerMs:quizObservation.first,inputChanges:Math.min(100000,quizObservation.changes)};
      quizObservation.ended=true;
    }
    enqueue([snapshot]);
    sendPending();
  }
  function sendPending() {
    if (!link.linked || sending || !pending.length) return;
    sending = true;
    var payload = pending[0];
    fetch('/api/' + link.user.role + '/demo-attempts', {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) throw new Error('保存失败');
      pending.shift();
      try { localStorage.removeItem(storageKey + payload.clientSubmissionId); } catch (_) {}
      sending = false;
      if (payload.result.total) link.batchesSubmitted++;
      renderBadge('已连接学情 · ' + (link.user.displayName || link.user.username) + ' · 答题与时长已保存', true);
      sendPending();
    }).catch(function () {
      sending = false;
      renderBadge('学情待同步 · 联网后自动重试', false);
    });
  }
  function flush() {
    enqueue([]);
    sendPending();
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
        if (body && body.user && ['student','teacher'].includes(body.user.role)) {
          link.linked = true;
          link.user = body.user;
          storageKey = 'demo-evidence-v2:' + body.user.id + ':';
          try {
            for (var i=0;i<localStorage.length;i++) {
              var key=localStorage.key(i);
              if (key.indexOf(storageKey) !== 0) continue;
              var saved=JSON.parse(localStorage.getItem(key));
              if (saved && saved.accountId === body.user.id && saved.clientSubmissionId && saved.result) pending.push(saved);
            }
          } catch (_) { /* 存储不可用时仍保存本页答题 */ }
          lastTick = lastInteraction = Date.now();
          renderBadge("已连接学情 · " + (body.user.displayName || body.user.username), true);
          sendPending();
          setInterval(flush, 15000);
        } else {
          renderBadge("独立模式 · 练习成绩仅本页保留", false);
        }
      })
      .catch(function () { renderBadge("独立模式 · 练习成绩仅本页保留", false); });
  }

  window.addEventListener("pagehide", function () { flush(true); });
  window.addEventListener("beforeunload", function () { flush(true); });
  window.addEventListener('online', sendPending);
  document.addEventListener('visibilitychange', function() { tick(); visible = !document.hidden; lastTick = Date.now(); if (visible) lastInteraction = Date.now(); flush(); });
  ['pointerdown','keydown','wheel','touchstart'].forEach(function(event) { document.addEventListener(event, function() { tick(); lastInteraction = Date.now(); }, {passive:true}); });
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(function(entries) { tick(); inViewport = entries[0].isIntersecting; if (inViewport) lastInteraction = Date.now(); flush(); }).observe(document.documentElement);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
