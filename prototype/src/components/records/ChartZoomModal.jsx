import { useCallback, useEffect, useState } from "react";

/**
 * 通用图表放大弹层：
 * - 小图态：包一层 .chart-zoomable，点击（或回车）打开大图；
 * - 大图态：全屏遮罩 + 白色弹层，同一份图表以更大尺寸重渲染；
 *   点遮罩、点「✕ 关闭」或按 Esc 收回小图。
 * 不引入任何图表库/弹层库，纯 React + CSS。
 */
export function ZoomableChart({ title, children }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <div
        className="chart-zoomable"
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        title={`点击放大「${title}」`}
      >
        {children}
        <span className="chart-zoom-hint" aria-hidden="true">⤢ 点击放大</span>
      </div>
      {open ? (
        <div className="chart-zoom-overlay" onClick={close} role="dialog" aria-modal="true" aria-label={`${title} · 大图`}>
          <div className="chart-zoom-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="chart-zoom-toolbar">
              <strong>{title}</strong>
              <button className="chart-zoom-close" onClick={close} type="button" aria-label="关闭大图">✕ 关闭</button>
            </div>
            <div className="chart-zoom-body">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
