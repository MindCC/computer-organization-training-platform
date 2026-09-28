#!/usr/bin/env bash
#
# 计算机组成原理实训平台 —— 云服务器部署脚本（在服务器上执行，幂等）
#
#   sudo bash deploy/deploy.sh
#
# 可用环境变量覆盖（都有默认值，直接跑即可）：
#   APP_USER=zcyl          运行服务的系统用户
#   APP_DIR=/opt/zcyl      代码目录（默认取本脚本所在仓库的根目录）
#   DATA_DIR=/var/lib/zcyl SQLite 数据目录
#   ETC_DIR=/etc/zcyl      环境变量文件目录
#   PORT=8787              后端端口（Nginx 反代到这个端口）
#   SERVER_NAME=_          Nginx server_name（有域名就填域名，否则保持 _）
#   ENABLE_TLS=0           置 1 时给 cookie 加 Secure 标记（配合 HTTPS）
#   SEED_DEMO=1            首次部署时播种演示班级（demo2026001 / Student123!）
#   INSTALL_NODE=0         置 1 时用 NodeSource 自动安装 Node 22
#   SKIP_NGINX=0           置 1 时不动 Nginx 配置
#   SKIP_BUILD=0           置 1 时跳过 vite build（dist 已由本机打包上传时用）
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-$REPO_DIR}"
APP_USER="${APP_USER:-zcyl}"
DATA_DIR="${DATA_DIR:-/var/lib/zcyl}"
ETC_DIR="${ETC_DIR:-/etc/zcyl}"
PORT="${PORT:-8787}"
SERVER_NAME="${SERVER_NAME:-_}"
ENABLE_TLS="${ENABLE_TLS:-0}"
SEED_DEMO="${SEED_DEMO:-1}"
INSTALL_NODE="${INSTALL_NODE:-0}"
SKIP_NGINX="${SKIP_NGINX:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
PROTO_DIR="$APP_DIR/prototype"
ENV_FILE="$ETC_DIR/platform.env"
SERVICE_FILE="/etc/systemd/system/zcyl-platform.service"

log() { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[deploy] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 执行（sudo bash deploy/deploy.sh）"
[ -f "$PROTO_DIR/package.json" ] || die "找不到 $PROTO_DIR/package.json —— 请确认代码已经上传到 $APP_DIR"

# ── 1. Node ────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  if [ "$INSTALL_NODE" = "1" ]; then
    log "安装 Node.js 22（NodeSource）"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  else
    die "服务器上没有 node。请先安装 Node 22+（例如 INSTALL_NODE=1 sudo -E bash deploy/deploy.sh），better-sqlite3 需要能编译原生模块（build-essential / python3）。"
  fi
fi
NODE_BIN="$(command -v node)"
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Node 版本过低（$("$NODE_BIN" -v)），本项目要求 >= 22"
log "Node $("$NODE_BIN" -v) · npm $(npm -v)"

# ── 2. 运行用户与目录 ──────────────────────────────────────────────────────
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  log "创建系统用户 $APP_USER"
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$DATA_DIR" "$ETC_DIR"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR" "$APP_DIR"
chmod 750 "$ETC_DIR"

# ── 3. 环境变量（只在首次生成 SESSION_SECRET，重跑不会让已登录用户掉线）──
if [ ! -f "$ENV_FILE" ]; then
  log "生成环境变量文件 $ENV_FILE"
  SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-48)"
  cat > "$ENV_FILE" <<EOF
# 计算机组成原理实训平台 · 生产环境变量（由 deploy/deploy.sh 生成）
NODE_ENV=production
PORT=$PORT
DATABASE_PATH=$DATA_DIR/classroom.sqlite
SESSION_SECRET=$SECRET
COOKIE_SECURE=$ENABLE_TLS
TRUST_PROXY=1
TRUST_PROXY_HOPS=1
# 智能助教（可选）：填了就走 DeepSeek，不填自动降级为本地规则建议
# DEEPSEEK_API_KEY=sk-xxx
EOF
  # PUBLIC_BASE_URL 只在有真实域名时写：留空则按请求自身 Host 做 CSRF Origin 校验（IP/端口直连才不出问题）
  if [ "$SERVER_NAME" != "_" ]; then
    if [ "$ENABLE_TLS" = "1" ]; then
      echo "PUBLIC_BASE_URL=https://$SERVER_NAME" >> "$ENV_FILE"
    else
      echo "PUBLIC_BASE_URL=http://$SERVER_NAME" >> "$ENV_FILE"
    fi
  fi
  chmod 640 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
else
  log "复用已有 $ENV_FILE（如需修改请手工编辑后 systemctl restart zcyl-platform）"
fi
set -a; . "$ENV_FILE"; set +a

# ── 4. 依赖 + 构建 ─────────────────────────────────────────────────────────
log "安装依赖（better-sqlite3 会在本机编译，首次约 1-3 分钟）"
cd "$PROTO_DIR"
if [ -f package-lock.json ]; then
  sudo -u "$APP_USER" -H npm ci --no-audit --no-fund
else
  sudo -u "$APP_USER" -H npm install --no-audit --no-fund
fi
if [ "$SKIP_BUILD" = "1" ]; then
  [ -f "$PROTO_DIR/dist/index.html" ] || die "SKIP_BUILD=1 但 $PROTO_DIR/dist/index.html 不存在——请先在本机 npm run build 并上传 dist/"
  log "跳过 vite build（SKIP_BUILD=1），使用已上传的 dist/"
else
  log "构建前端（vite build → prototype/dist）"
  sudo -u "$APP_USER" -H npm run build
fi

# ── 5. 迁移 + 播种 ─────────────────────────────────────────────────────────
log "执行数据库迁移"
sudo -u "$APP_USER" -H env DATABASE_PATH="$DATABASE_PATH" npm run migrate

if ! sudo -u "$APP_USER" -H env DATABASE_PATH="$DATABASE_PATH" node -e '
  import("better-sqlite3").then(({ default: Database }) => {
    const db = new Database(process.env.DATABASE_PATH, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = ?").get("teacher");
    process.exit(row.n > 0 ? 0 : 1);
  });' ; then
  log "创建教师账号（默认 teacher / ChangeMe123!，请登录后立即修改）"
  sudo -u "$APP_USER" -H env DATABASE_PATH="$DATABASE_PATH" npm run seed:teacher
fi

if [ "$SEED_DEMO" = "1" ]; then
  log "播种演示班级（40 名学生，演示账号 demo2026001 / Student123!）"
  sudo -u "$APP_USER" -H env DATABASE_PATH="$DATABASE_PATH" npm run seed:demo
fi

# ── 6. systemd ─────────────────────────────────────────────────────────────
log "安装 systemd 服务"
sed -e "s#@APP_USER@#$APP_USER#g" \
    -e "s#@APP_DIR@#$APP_DIR#g" \
    -e "s#@NODE_BIN@#$NODE_BIN#g" \
    -e "s#@ENV_FILE@#$ENV_FILE#g" \
    "$APP_DIR/deploy/zcyl-platform.service" > "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable zcyl-platform >/dev/null
systemctl restart zcyl-platform
sleep 2
systemctl is-active --quiet zcyl-platform || { journalctl -u zcyl-platform -n 40 --no-pager; die "服务启动失败"; }
log "服务已启动：$(systemctl is-active zcyl-platform)"

# ── 7. Nginx 反代 ──────────────────────────────────────────────────────────
if [ "$SKIP_NGINX" != "1" ]; then
  if command -v nginx >/dev/null 2>&1; then
    log "写入 Nginx 站点配置"
    CONF=/etc/nginx/conf.d/zcyl-platform.conf
    sed -e "s#@SERVER_NAME@#$SERVER_NAME#g" -e "s#@PORT@#$PORT#g" \
      "$APP_DIR/deploy/nginx-zcyl.conf" > "$CONF"
    if nginx -t >/dev/null 2>&1; then
      systemctl reload nginx || systemctl restart nginx
      log "Nginx 已重载"
    else
      nginx -t || true
      die "Nginx 配置校验失败，已保留 $CONF，请检查后手工 reload"
    fi
  else
    log "未检测到 Nginx —— 后端直接监听 $PORT，如需 80 端口访问请安装 Nginx 或改用 PORT=80"
  fi
fi

# ── 8. 自检 ────────────────────────────────────────────────────────────────
sleep 1
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  log "健康检查通过：http://127.0.0.1:$PORT/api/health"
else
  die "健康检查失败，请查看 journalctl -u zcyl-platform -n 50"
fi

cat <<EOF

──────────────────────────────────────────────
部署完成 🎉

  访问地址   http://<服务器公网 IP>/            （已配 Nginx 时）
             或 http://<服务器公网 IP>:$PORT/   （直连后端时）
  演示账号   demo2026001 / Student123!          （学生，含演示班级学情）
  教师账号   teacher / ChangeMe123!             （务必尽快改密码）
  数据文件   $DATABASE_PATH
  环境变量   $ENV_FILE
  日志       journalctl -u zcyl-platform -f

  云服务器安全组 / 防火墙需要放行 80（以及 443，若启用 HTTPS）。
──────────────────────────────────────────────
EOF
