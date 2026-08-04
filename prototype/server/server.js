import { createApp } from "./app.js";
import { openDatabase } from "./db.js";

const DEFAULT_SECRET = "development-session-secret";
const secret = process.env.SESSION_SECRET || DEFAULT_SECRET;

// 生产模式强制要求自定义会话密钥，拒绝使用固定默认值（防 token 摘要可预测）
if (process.env.NODE_ENV === "production" && secret === DEFAULT_SECRET) {
  console.error("[FATAL] 生产环境必须设置 SESSION_SECRET 环境变量（任意长随机字符串），已拒绝启动。");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8787);
const db = openDatabase(process.env.DATABASE_PATH);
const app = createApp({ db, sessionSecret: secret });

app.listen(port, "0.0.0.0", () => {
  console.log(`Classroom server listening on http://0.0.0.0:${port}`);
});
