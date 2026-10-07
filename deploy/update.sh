#!/usr/bin/env bash
# Existing Linux/systemd installation: sudo bash deploy/update.sh
# Overrides: APP_DIR, APP_USER, SERVICE, ENV_FILE, DATABASE_PATH, PORT, REMOTE,
# BACKUP_ROOT. Credentials stay in the repository owner's existing Git config.
set -euo pipefail
umask 022

log() { printf '[update] %s\n' "$*"; }
die() { printf '[update] %s\n' "$*" >&2; exit 1; }
[[ $EUID == 0 ]] || die '请执行 sudo bash deploy/update.sh'

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_USER="${APP_USER:-zcyl}"
SERVICE="${SERVICE:-zcyl-platform}"
ENV_FILE="${ENV_FILE:-/etc/zcyl/platform.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/zcyl}"
PROTO_DIR="$APP_DIR/prototype"
for tool in git node npm sudo curl flock systemctl; do
  command -v "$tool" >/dev/null || die "缺少命令：$tool"
done
[[ -d "$APP_DIR/.git" && -f "$PROTO_DIR/package-lock.json" ]] || die '找不到已部署的代码仓库'
[[ -f "$ENV_FILE" ]] || die "找不到现有服务配置：$ENV_FILE"
id "$APP_USER" >/dev/null 2>&1 || die "找不到服务用户：$APP_USER"
[[ $(node -p 'Number(process.versions.node.split(".")[0])') -ge 22 ]] || die '需要 Node.js 22+'
systemctl cat "$SERVICE" >/dev/null || die "找不到服务：$SERVICE"
exec 9>/var/lock/zcyl-update.lock
flock -n 9 || die '另一项更新正在执行'

# Read the existing database/port settings without printing any credentials.
requested_database="${DATABASE_PATH:-}"
requested_port="${PORT:-}"
set -a
. "$ENV_FILE"
set +a
DATABASE_PATH="${requested_database:-${DATABASE_PATH:-/var/lib/zcyl/classroom.sqlite}}"
PORT="${requested_port:-${PORT:-8787}}"
[[ "$DATABASE_PATH" == /* && -f "$DATABASE_PATH" ]] || die 'DATABASE_PATH 必须指向现有数据库的绝对路径'
[[ "$PORT" =~ ^[0-9]+$ ]] || die 'PORT 必须是数字'

REPO_USER="$(stat -c '%U' "$APP_DIR/.git")"
repo_git() { sudo -u "$REPO_USER" -H git -C "$APP_DIR" "$@"; }
[[ $(repo_git branch --show-current) == main ]] || die '请先切换服务器代码仓库到 main 分支'
repo_git diff --quiet && repo_git diff --cached --quiet || die '服务器存在未提交的代码修改，请先处理后再更新'
REMOTE="${REMOTE:-}"
if [[ -z "$REMOTE" ]]; then
  while IFS= read -r candidate; do
    url="$(repo_git remote get-url "$candidate")"
    if [[ "$url" =~ ^https://gitee\.com/cplus1/composition-principle-platform(\.git)?$ ||
          "$url" =~ ^git@gitee\.com:cplus1/composition-principle-platform(\.git)?$ ]]; then
      REMOTE="$candidate"
      break
    fi
  done < <(repo_git remote)
fi
REMOTE="${REMOTE:-https://gitee.com/cplus1/composition-principle-platform.git}"
if [[ "$REMOTE" != https://* && "$REMOTE" != git@* ]]; then
  repo_git remote get-url "$REMOTE" >/dev/null
fi

log "从 $REMOTE 获取 main"
repo_git fetch "$REMOTE" main
target="$(repo_git rev-parse FETCH_HEAD)"
old_revision="$(repo_git rev-parse HEAD)"
repo_git merge-base --is-ancestor "$old_revision" "$target" || die '服务器提交与 Gitee main 分叉，已停止；不会覆盖本地提交'

backup_dir="$BACKUP_ROOT/update-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 700 "$backup_dir"
printf '%s\n' "$old_revision" > "$backup_dir/revision.txt"
stage_dir="$(mktemp -d "$PROTO_DIR/.update-build.XXXXXX")"
chown "$REPO_USER" "$stage_dir"
on_exit() {
  result=$?
  # stage_dir comes only from mktemp within this repository.
  if [[ -n "${stage_dir:-}" && "$stage_dir" == "$PROTO_DIR"/.update-build.* ]]; then
    rm -rf -- "$stage_dir"
  fi
  if [[ $result != 0 ]]; then
    printf '[update] 更新未完成。备份：%s；服务状态：systemctl status %s\n' "$backup_dir" "$SERVICE" >&2
    printf '[update] 不会自动还原数据库，以免覆盖新学习记录。\n' >&2
  fi
}
trap on_exit EXIT

log '备份数据库（SQLite 在线一致性备份）和当前前端'
cd "$PROTO_DIR"
DATABASE_PATH="$DATABASE_PATH" BACKUP_PATH="$backup_dir/classroom.sqlite" node --input-type=module -e '
  import Database from "better-sqlite3";
  const db = new Database(process.env.DATABASE_PATH, { readonly: true });
  try { await db.backup(process.env.BACKUP_PATH); } finally { db.close(); }
'
if [[ -d "$PROTO_DIR/dist" ]]; then cp -a "$PROTO_DIR/dist" "$backup_dir/dist"; fi

repo_git merge --ff-only "$target"
log '安装依赖并构建新版前端'
sudo -u "$REPO_USER" -H npm ci --include=dev --no-audit --no-fund
sudo -u "$REPO_USER" -H node node_modules/vite/bin/vite.js build --outDir "$stage_dir/dist" --emptyOutDir --manifest
(
  cd "$stage_dir"
  sudo -u "$REPO_USER" -H node "$PROTO_DIR/scripts/compress-dist.mjs"
)
[[ -s "$stage_dir/dist/index.html" ]] || die '构建结果缺少 index.html'

# Leave the current frontend available until the new build is ready.
log '切换版本并迁移数据库'
systemctl stop "$SERVICE"
sudo -u "$APP_USER" -H env DATABASE_PATH="$DATABASE_PATH" npm run migrate
if [[ -d "$PROTO_DIR/dist" ]]; then mv "$PROTO_DIR/dist" "$stage_dir/previous-dist"; fi
mv "$stage_dir/dist" "$PROTO_DIR/dist"

# A separate version-only drop-in retains every existing AI/service setting.
install -d -m 755 "/etc/systemd/system/$SERVICE.service.d"
version_env="${ENV_FILE%/*}/update-version.env"
printf 'HERMES_BUILD_ID=%s\n' "$target" > "$version_env"
chown root:"$APP_USER" "$version_env"
chmod 640 "$version_env"
printf '[Service]\nEnvironmentFile=%s\n' "$version_env" > "/etc/systemd/system/$SERVICE.service.d/zz-update-version.conf"
systemctl daemon-reload
systemctl restart "$SERVICE"

log '检查服务和发布版本'
for attempt in {1..30}; do
  if systemctl is-active --quiet "$SERVICE" &&
     curl --max-time 2 -fsS "http://127.0.0.1:$PORT/api/health" > "$stage_dir/health.json" &&
     node --input-type=module -e '
       import { readFileSync } from "node:fs";
       const health = JSON.parse(readFileSync(process.argv[1], "utf8"));
       process.exit(health.ok === true && health.version === process.argv[2] ? 0 : 1);
     ' "$stage_dir/health.json" "$target"; then
    log "更新完成：$target"
    log "备份目录：$backup_dir"
    exit 0
  fi
  sleep 1
done
die "健康检查未通过，请查看 journalctl -u $SERVICE -n 50"
