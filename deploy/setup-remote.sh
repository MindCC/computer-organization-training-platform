#!/usr/bin/env bash
#
# 部署后段：环境 → 迁移 → 播种 → systemd → 自检。
# 依赖与 dist 已就位（见 deploy/README.md）；该脚本可重复执行。
set -euo pipefail

APP_USER=zcyl
APP_DIR=/opt/zcyl
PROTO_DIR=$APP_DIR/prototype
DATA_DIR=/var/lib/zcyl
ETC_DIR=/etc/zcyl
ENV_FILE=$ETC_DIR/platform.env
PORT=8787

log() { printf '\033[36m[setup]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[setup] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 执行"

# ── 环境变量（不存在则生成，已存在则复用）───────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  log "生成 $ENV_FILE"
  mkdir -p "$ETC_DIR"
  SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-48)"
  cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
PORT=$PORT
DATABASE_PATH=$DATA_DIR/classroom.sqlite
SESSION_SECRET=$SECRET
COOKIE_SECURE=0
ENABLE_DEMO_LOGIN=1
TRUST_PROXY=1
TRUST_PROXY_HOPS=1
ENVEOF
  chmod 640 "$ENV_FILE"
fi
chown root:"$APP_USER" "$ENV_FILE" 2>/dev/null || true
set -a; . "$ENV_FILE"; set +a

# ── 目录与归属 ──────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR" "$APP_DIR"

# ── 原生模块自检（脚本文件，避免引号转义问题；NODE_PATH 指向依赖）──────
cat > /tmp/zcyl-check-db.cjs <<'CHECKEOF'
const Database = require("better-sqlite3");
const db = new Database(":memory:");
db.exec("CREATE TABLE t(a)");
console.log("better-sqlite3 OK", process.version);
CHECKEOF
sudo -u "$APP_USER" -H env NODE_PATH="$PROTO_DIR/node_modules" node /tmp/zcyl-check-db.cjs

# ── 迁移 ────────────────────────────────────────────────────────────────
log "数据库迁移"
sudo -u "$APP_USER" -H env DATABASE_PATH="$DATABASE_PATH" npm --prefix "$PROTO_DIR" run migrate

# ── 播种 ────────────────────────────────────────────────────────────────
if sudo -u "$APP_USER" -H env NODE_PATH="$PROTO_DIR/node_modules" DATABASE_PATH="$DATABASE_PATH" node "$APP_DIR/deploy/check-teacher.mjs" 2>/dev/null; then
  log "教师账号已存在，跳过 seed:teacher"
else
  log "创建教师账号（teacher / ChangeMe123!，请登录后尽快修改）"
  sudo -u "$APP_USER" -H env DATABASE_PATH="$DATABASE_PATH" npm --prefix "$PROTO_DIR" run seed:teacher
fi
log "播种演示班级"
sudo -u "$APP_USER" -H env DATABASE_PATH="$DATABASE_PATH" npm --prefix "$PROTO_DIR" run seed:demo

# ── systemd（heredoc 直接生成，避免 sed 模板替换的转义坑）───────────────
log "安装并启动服务"
NODE_BIN="$(command -v node)"
[ -n "$NODE_BIN" ] || die "找不到 node 可执行文件"
cat > /etc/systemd/system/zcyl-platform.service <<UNITEOF
[Unit]
Description=ChiQuest composition-principle platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/prototype
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN server/server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=zcyl-platform
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable zcyl-platform >/dev/null 2>&1 || true
systemctl restart zcyl-platform
sleep 3
systemctl is-active --quiet zcyl-platform || { journalctl -u zcyl-platform -n 40 --no-pager; die "服务启动失败"; }

# ── 自检 ────────────────────────────────────────────────────────────────
sleep 1
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null || { journalctl -u zcyl-platform -n 40 --no-pager; die "健康检查失败"; }
log "健康检查通过：http://127.0.0.1:$PORT/api/health"
echo "SETUP_DONE"
