import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Cpu,
  Eye,
  EyeSlash,
  GraduationCap,
  Lightning,
  PresentationChart,
  Circuitry,
  Storefront,
  SpinnerGap,
} from "@phosphor-icons/react";
import { buildRoleEntryCopy } from "../../questExperience.js";
import "./LoginPortal.css";

const roleOrder = ["student", "teacher"];

const routeSteps = [
  { id: "circuit", icon: Circuitry, label: "探索电路" },
  { id: "build", icon: Cpu, label: "装配电脑" },
  { id: "shop", icon: Storefront, label: "经营装机店" },
];

export function LoginPortal({ loginForm, setLoginForm, loginError, onSubmit, onBack, onDemoLogin }) {
  const [role, setRole] = useState("student");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(null);
  const pendingRef = useRef(false);
  const rootRef = useRef(null);
  const copy = buildRoleEntryCopy(role);

  // 使用纯 CSS keyframes 揭示动画,不依赖 GSAP / requestAnimationFrame。
  // 选择 CSS 动画的原因:Playwright headless Chromium 在自动化环境下 rAF 节流严苛,
  // GSAP from() 可能卡在 FROM 状态(opacity:0 + visibility:hidden)导致表单不可见;
  // CSS @keyframes 由浏览器主线程驱动,语义对 a11y/自动化定位更稳定。
  // prefers-reduced-motion 通过 CSS 媒体查询自动降级到 0.01s。
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    node.classList.add("login-portal--animate-in");
    return undefined;
  }, []);

  function selectRole(nextRole) {
    if (pendingRef.current) return;
    setRole(nextRole);
  }

  function handleRoleKeyDown(event) {
    if (pendingRef.current) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const currentIndex = roleOrder.indexOf(role);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? roleOrder.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + roleOrder.length) % roleOrder.length;
    const nextRole = roleOrder[nextIndex];
    setRole(nextRole);
    rootRef.current?.querySelector(`[data-login-role="${nextRole}"]`)?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy("account");
    try { await onSubmit(event); }
    finally { pendingRef.current = false; setBusy(null); }
  }

  async function demoLogin() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy("demo");
    try { await onDemoLogin(); }
    finally { pendingRef.current = false; setBusy(null); }
  }

  return (
    <main className="login-portal" ref={rootRef}>
      <header className="login-portal-header">
        <div className="brand login-brand">
          <img className="brand-wordmark" src="/home/wordmark.png" alt="芯游记" />
          <img className="brand-logo" src="/home/logo.png" alt="" />
        </div>
        <span className="login-platform-name">计算机组成原理实训平台</span>
        {onBack ? <button className="login-back" onClick={onBack} disabled={Boolean(busy)} type="button"><ArrowLeft size={16} aria-hidden="true"/>先浏览课程</button> : null}
      </header>
      <div className="login-portal-body">
      <section className="login-story" data-login-reveal aria-labelledby="login-story-title">
        <img className="login-workshop-image" src="/shop-story/shop-empty.webp" alt="阳光下的装机工坊，工作台上摆放着主机和电脑元件" fetchPriority="high" />
        <div className="login-story-copy">
          <span className="login-kicker">
            <Cpu aria-hidden="true" size={18} weight="duotone" />
            让知识在手中运行
          </span>
          <h1 id="login-story-title"><span>把原理，</span><span>亲手装出来。</span></h1>
          <p>接好第一根导线，装好第一台电脑。</p>
        </div>

        <ol className="login-route" aria-label="实训路径">
          {routeSteps.map(({ id, icon: Icon, label }) => (
            <li key={id}>
              <span className="login-route-icon">
                <Icon aria-hidden="true" size={19} weight="duotone" />
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </section>

      <form
        aria-describedby="login-account-help"
        aria-labelledby="login-form-heading"
        className="login-form-panel"
        onSubmit={submit}
        aria-busy={Boolean(busy)}
        data-login-reveal
      >
        <div className="login-form-console">
          <div className="login-form-intro">
            <h2 id="login-form-heading">欢迎来到芯游记</h2>
            <span>{role === "teacher" ? "进入课堂，开启今天的教学。" : "登录账号，继续你的探索之旅。"}</span>
          </div>

          <div className="login-role-tabs" role="tablist" aria-label="登录身份" onKeyDown={handleRoleKeyDown}>
            <button
              aria-controls="login-role-panel"
              aria-selected={role === "student"}
              className={role === "student" ? "active" : ""}
              data-login-role="student"
              id="login-role-student"
              onClick={() => selectRole("student")}
              role="tab"
              tabIndex={role === "student" ? 0 : -1}
              type="button"
              disabled={Boolean(busy)}
            >
              <GraduationCap aria-hidden="true" size={20} />
              学生入口
            </button>
            <button
              aria-controls="login-role-panel"
              aria-selected={role === "teacher"}
              className={role === "teacher" ? "active" : ""}
              data-login-role="teacher"
              id="login-role-teacher"
              onClick={() => selectRole("teacher")}
              role="tab"
              tabIndex={role === "teacher" ? 0 : -1}
              type="button"
              disabled={Boolean(busy)}
            >
              <PresentationChart aria-hidden="true" size={20} />
              教师入口
            </button>
          </div>

          <div
            aria-labelledby={`login-role-${role}`}
            className="login-role-panel"
            id="login-role-panel"
            role="tabpanel"
          >
            <label className="form-row" htmlFor="login-username">
              <span>{copy.usernameLabel}</span>
              <input
                aria-label={`账号（${copy.usernameLabel}）`}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={Boolean(busy)}
                aria-invalid={Boolean(loginError)}
                aria-describedby={loginError ? "login-error" : "login-account-help"}
                id="login-username"
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                placeholder={copy.usernamePlaceholder}
                value={loginForm.username}
              />
            </label>
            <div className="form-row">
              <label htmlFor="login-password">密码</label>
              <div className="login-password-field">
              <input
                autoComplete="current-password"
                id="login-password"
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="请输入密码"
                required
                disabled={Boolean(busy)}
                aria-invalid={Boolean(loginError)}
                aria-describedby={loginError ? "login-error" : undefined}
                type={showPassword ? "text" : "password"}
                value={loginForm.password}
              />
              <button className="login-password-toggle" type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword}>{showPassword ? <EyeSlash size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}</button>
              </div>
            </div>
          </div>

          {loginError ? <p aria-live="polite" className="form-error" id="login-error">{loginError}</p> : null}

          <button className="primary-button login-submit" type="submit" disabled={Boolean(busy)}>
            <span>{busy === "account" ? "正在登录…" : copy.submitLabel}</span>
            {busy === "account" ? <SpinnerGap className="login-spinner" aria-hidden="true" size={20}/> : <ArrowRight aria-hidden="true" size={20} />}
          </button>
          {onDemoLogin ? (
            <>
            <div className="login-divider"><span>也可以先体验一下</span></div>
            <button className="demo-login-button" onClick={demoLogin} disabled={Boolean(busy)} type="button">
              <Lightning aria-hidden="true" size={19} weight="fill" />
              <span>
                <strong>{busy === "demo" ? "正在进入演示…" : "一键体验演示账号"}</strong>
                <small>免输入，探索完整课程与装机工坊</small>
              </span>
              {busy === "demo" ? <SpinnerGap className="login-spinner" aria-hidden="true" size={18}/> : <ArrowRight size={18} aria-hidden="true"/>}
            </button>
            </>
          ) : null}
          <small id="login-account-help">{copy.help}。{role === "student" ? "登录遇到问题请联系任课教师。" : "请使用学校分配的教师账号登录。"}</small>
        </div>
      </form>
      </div>
    </main>
  );
}
