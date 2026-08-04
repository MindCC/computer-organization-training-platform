import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Cpu,
  GraduationCap,
  PresentationChart,
  Signpost,
} from "@phosphor-icons/react";
import { gsap } from "gsap";
import { buildRoleEntryCopy } from "../../questExperience.js";
import { questEntrance } from "../../motion/questMotion.js";
import { useQuestMotion } from "../../motion/useQuestMotion.js";
import "./LoginPortal.css";

const roleOrder = ["student", "teacher"];

const routeSteps = [
  { id: "brief", icon: Signpost, label: "领取课堂任务" },
  { id: "build", icon: GraduationCap, label: "进入工程工作台" },
  { id: "verify", icon: PresentationChart, label: "验证并提交成果" },
];

export function LoginPortal({ loginForm, setLoginForm, loginError, onSubmit }) {
  const [role, setRole] = useState("student");
  const rootRef = useRef(null);
  const copy = buildRoleEntryCopy(role);

  useQuestMotion(rootRef, ({ gsap, reducedMotion }) => {
    gsap.fromTo(
      "[data-login-reveal]",
      questEntrance(reducedMotion),
      {
        autoAlpha: 1,
        y: 0,
        duration: reducedMotion ? 0.01 : 0.5,
        stagger: reducedMotion ? 0 : 0.08,
        clearProps: "autoAlpha",
      },
    );
  }, []);

  // 安全网:React StrictMode 在 dev 下重挂载会偶发中断 GSAP 入口动画,
  // 导致登录表单停在 autoAlpha:0 而不可见。若动画未完成,此处强制恢复可见。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      gsap.set("[data-login-reveal]", { clearProps: "autoAlpha" });
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);

  function selectRole(nextRole) {
    setRole(nextRole);
  }

  function handleRoleKeyDown(event) {
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

  return (
    <main className="login-portal" ref={rootRef}>
      <section className="login-story" data-login-reveal aria-labelledby="login-story-title">
        <div className="login-story-copy">
          <span className="login-kicker">
            <Cpu aria-hidden="true" size={18} weight="duotone" />
            组成原理实训平台
          </span>
          <h1 id="login-story-title">装配知识，运行你的第一台计算机</h1>
          <p>沿着课程地图完成逻辑门、加法器、存储系统与整机配置挑战。</p>
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
        data-login-reveal
        onSubmit={onSubmit}
      >
        <div className="login-form-console">
          <div className="login-form-intro">
            <p>课堂账号入口</p>
            <h2 id="login-form-heading">进入你的实训工作台</h2>
            <span>选择身份后，使用任课教师发放的账号登录。</span>
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
                id="login-username"
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                placeholder={copy.usernamePlaceholder}
                value={loginForm.username}
              />
            </label>
            <label className="form-row" htmlFor="login-password">
              <span>密码</span>
              <input
                autoComplete="current-password"
                id="login-password"
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                type="password"
                value={loginForm.password}
              />
            </label>
          </div>

          {loginError ? <p aria-live="polite" className="form-error" id="login-error">{loginError}</p> : null}

          <button className="primary-button login-submit" type="submit">
            <span>{copy.submitLabel}</span>
            <ArrowRight aria-hidden="true" size={20} weight="bold" />
          </button>
          <small id="login-account-help">{copy.help}。登录遇到问题请联系任课教师。</small>
        </div>
      </form>
    </main>
  );
}
