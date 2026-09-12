/**
 * 生成客户端幂等标识。
 *
 * `crypto.randomUUID` 只在安全上下文可用：`http://127.0.0.1` 可以，但教室常见的
 * `http://<局域网IP>:8787` 不行。课堂提交与练习同步都依赖这个标识，缺失时必须降级
 * 而不是抛错，否则整条提交链路会在发出请求之前就中断。
 */
export function createRandomId(prefix = "id") {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
