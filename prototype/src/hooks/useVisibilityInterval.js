import { useEffect, useRef } from "react";

/**
 * 按固定间隔执行回调，并跳过后台标签页。
 *
 * 回调存放在 ref 中：父组件每次渲染产生的新函数不会再重置计时器。
 * 教师看板此前直接把 setInterval 建在 effect 里并依赖每次渲染都变化的函数，
 * 导致"每 45 秒自动刷新"实际永远不会触发。
 */
export function useVisibilityInterval(callback, intervalMs, enabled = true) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      callbackRef.current?.();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
}
