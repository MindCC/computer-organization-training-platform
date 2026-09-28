# 部署到云服务器

目标服务器：`106.54.15.142`（已探明 22 / 80 / 443 开放，3000/5173/8787 无服务）。

平台是 **Express + better-sqlite3 + React** 的全栈应用，所以部署方式 = Node 进程 + SQLite 文件 + Nginx 反代。本目录里的脚本会自动完成这件事：

| 文件 | 作用 |
| --- | --- |
| `deploy.sh` | 服务器上执行的一键部署（幂等，可重复跑） |
| `zcyl-platform.service` | systemd 服务单元（开机自启、崩溃自动拉起） |
| `nginx-zcyl.conf` | Nginx 反代到后端端口，放通 80 |

## 一、准备

服务器需要：Node 22+、npm、能编译原生模块（`build-essential` / `python3`，better-sqlite3 要用）、选装 Nginx。
脚本会自动检测；没有 Node 时可以 `INSTALL_NODE=1` 让它用 NodeSource 装。

## 二、执行（两种方式，任选）

### 方式 A：我（AI）来部署

需要你提供 SSH 登录方式，二选一：

1. **推荐：用密钥**。我已经在本机生成好一对部署密钥：
   - 私钥：`C:\Users\shao\.ssh\zcyl_deploy`（不离开你的机器）
   - 公钥：
     ```
     ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDKyTf8JF2YxJgGs8u0O36M6mJTXWnezPAk/WY9R6Yj0 zcyl-deploy-from-workstation
     ```
     在服务器上执行（把 `root` 换成你要用的登录用户）：
     ```bash
     mkdir -p ~/.ssh && chmod 700 ~/.ssh
     echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDKyTf8JF2YxJgGs8u0O36M6mJTXWnezPAk/WY9R6Yj0 zcyl-deploy-from-workstation' >> ~/.ssh/authorized_keys
     chmod 600 ~/.ssh/authorized_keys
     ```
     然后告诉我「用户名 + 已加公钥」即可。

2. **或**：告诉我已有的私钥路径（例如 `C:\Users\shao\.ssh\id_rsa`）与登录用户名。

> 注意：这个执行环境无法交互式输入密码，所以必须走密钥。

### 方式 B：你自己在服务器上跑

```bash
# 1. 拿到代码（Gitee 仓库是私有的，用带 token 的地址或部署密钥）
sudo mkdir -p /opt/zcyl && sudo chown "$USER" /opt/zcyl
git clone https://gitee.com/cplus1/composition-principle-platform.git /opt/zcyl

# 2. 一键部署（首次建议带上 INSTALL_NODE=1）
cd /opt/zcyl
sudo INSTALL_NODE=1 SERVER_NAME=106.54.15.142 bash deploy/deploy.sh
```

跑完会打印访问地址、演示账号与日志命令。脚本可重复执行：**只在首次生成 `SESSION_SECRET`**，重跑不会让已登录用户掉线。

## 三、部署脚本做了什么

1. 检查/（可选）安装 Node 22；
2. 创建运行用户 `zcyl`、数据目录 `/var/lib/zcyl`、配置目录 `/etc/zcyl`；
3. 生成 `/etc/zcyl/platform.env`（`NODE_ENV=production`、随机 `SESSION_SECRET`、`DATABASE_PATH`、`TRUST_PROXY=1`；`ENABLE_TLS=1` 时加 `COOKIE_SECURE=1`）；
4. `npm ci` + `npm run build`（vite → `prototype/dist`，生产模式下 Express 直接托管它）；
5. `npm run migrate`；没有教师账号就 `seed:teacher`；`SEED_DEMO=1` 时 `seed:demo`（40 人演示班级）；
6. 安装并启动 `zcyl-platform.service`；
7. 写入并校验 Nginx 配置后 reload；
8. 自检 `GET /api/health`。

## 四、云服务器侧还要确认

- **安全组 / 防火墙放行 80**（以及 443，若启用 HTTPS）；
- 如果服务器上已有**宝塔 / 其它站点占用 80**，把 `deploy/nginx-zcyl.conf` 里的 `server_name` 改成域名，或改监听端口；
- 有域名的话建议上 HTTPS：`certbot --nginx -d 你的域名`，然后把 `/etc/zcyl/platform.env` 里的 `COOKIE_SECURE` 改成 `1` 并 `systemctl restart zcyl-platform`，同时把 `PUBLIC_BASE_URL` 改成 `https://你的域名`。

## 五、部署前的门禁（本机执行）

`docs/classroom-deployment.md` 要求上线前跑：

```bash
cd prototype
npm test
npm run qa:assets
npm run build
npm run qa:classroom-load
```

## 六、日常运维

```bash
systemctl status zcyl-platform        # 状态
journalctl -u zcyl-platform -f        # 实时日志
systemctl restart zcyl-platform       # 重启
```

更新版本：

```bash
cd /opt/zcyl && git pull && sudo bash deploy/deploy.sh
```

备份 / 回滚（数据只有一个 SQLite 文件）：

```bash
sudo cp /var/lib/zcyl/classroom.sqlite /var/lib/zcyl/backup-$(date +%F).sqlite
sudo systemctl stop zcyl-platform
sudo cp /var/lib/zcyl/backup-2026-09-28.sqlite /var/lib/zcyl/classroom.sqlite
sudo systemctl start zcyl-platform
```

## 七、静态演示版（备用）

如果只想给一个「打开就能看演示页」的静态站点，仓库根的 `preview/` 目录就是成品（由 `cd prototype && npm run preview:site` 生成，`npm test` 会校验它与源文件一致）：

- 直接拖到 Netlify Drop，或上传到 Cloudflare Pages 的 Direct Upload；
- 也可以扔进服务器任意静态目录，例如 `sudo cp -r preview /var/www/zcyl-preview`，再配一个 Nginx `root` 站点。

注意：平台本身已经通过 `/demos/*.html` 对外提供这 8 个演示页，所以部署了完整平台就不必再单独放静态版。
