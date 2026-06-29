# 课堂集中版部署与运维

本文档面向把 `prototype` 部署到一台云服务器、供 1-3 个班约 150 名学生长期课堂使用的场景。首版使用 Node.js + SQLite 单实例运行，后续如迁移 PostgreSQL，优先替换 `prototype/server/db.js` 中的数据访问实现。

## 服务器要求

- Ubuntu 22.04/24.04 或同等 Linux 发行版。
- Node.js 20 LTS 或更新的 20/22 LTS。
- 至少 1 vCPU、2 GB 内存、20 GB 磁盘。SQLite 数据库建议放在持久化磁盘。
- 服务器时间保持同步，建议启用 `systemd-timesyncd`。

## 环境变量

在服务器上创建 `/etc/zcyl-training.env`：

```bash
PORT=8787
DATABASE_PATH=/var/lib/zcyl-training/classroom.sqlite
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_SETUP_TOKEN=replace-with-one-time-setup-token
PUBLIC_BASE_URL=https://training.example.com
TEACHER_USERNAME=teacher
TEACHER_PASSWORD=ChangeMe123!
TEACHER_NAME=任课教师
```

`SESSION_SECRET` 和 `ADMIN_SETUP_TOKEN` 必须使用随机长字符串。`TEACHER_PASSWORD` 只用于首次执行 `npm run seed:teacher`，创建后应从环境文件中移除或改成一次性值。

## 首次部署

```bash
cd /opt/zcyl_training/prototype
npm install
npm run build
mkdir -p /var/lib/zcyl-training
npm run migrate
npm run seed:teacher
npm run server
```

生产启动顺序固定为：

```bash
npm install
npm run build
npm run migrate
npm run seed:teacher
npm run server
```

`npm run server` 会托管 `dist` 静态文件和 `/api/*` 接口。默认监听 `PORT`，未设置时为 `8787`。

## systemd 服务

创建 `/etc/systemd/system/zcyl-training.service`：

```ini
[Unit]
Description=ZCYL classroom training platform
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/zcyl_training/prototype
EnvironmentFile=/etc/zcyl-training.env
ExecStart=/usr/bin/npm run server
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zcyl-training
sudo systemctl status zcyl-training
```

## Nginx 与 HTTPS

示例反代：

```nginx
server {
  listen 80;
  server_name training.example.com;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

上线课堂环境必须启用 HTTPS，可用 Certbot：

```bash
sudo certbot --nginx -d training.example.com
```

## 数据文件与备份

默认数据库路径由 `DATABASE_PATH` 指定。建议：

- 正式库：`/var/lib/zcyl-training/classroom.sqlite`
- 备份目录：`/var/backups/zcyl-training/`

在线备份使用 SQLite 原生命令：

```bash
sqlite3 /var/lib/zcyl-training/classroom.sqlite ".backup '/var/backups/zcyl-training/classroom-$(date +%F-%H%M).sqlite'"
```

建议每天课后备份一次，并把最近 7 天备份复制到对象存储或另一台机器。恢复时先停止服务：

```bash
sudo systemctl stop zcyl-training
cp /var/backups/zcyl-training/classroom-YYYY-MM-DD-HHMM.sqlite /var/lib/zcyl-training/classroom.sqlite
sudo chown www-data:www-data /var/lib/zcyl-training/classroom.sqlite
sudo systemctl start zcyl-training
```

## 教师日常流程

1. 教师登录。
2. 创建班级。
3. 粘贴或上传 CSV 内容导入学生，格式：

```csv
学号,姓名,初始密码
2026001,李同学,Student123!
2026002,王同学,Student123!
```

4. 学生使用学号和初始密码登录。
5. 学生完成 React Flow 关卡，提交记录自动保存到服务器。
6. 教师在看板查看完成率、平均分、高频错误，并导出 CSV 成绩。

## 故障处理

### 忘记学生密码

教师进入教师看板，在学生行点击“重置密码”。默认重置为 `ChangeMe123!`，课堂上应要求学生登录后修改密码。

### 忘记教师密码

服务器管理员可用一次性脚本重设，推荐先备份数据库，再通过 Node REPL 或临时维护脚本调用 `hashPassword` 和 `updateUserPassword`。不要开放公开找回密码入口。

### CSV 导入失败

检查：

- 第一行是否为 `学号,姓名,初始密码` 或等价列名。
- 学号和姓名不能为空。
- 学号不能与教师账号重名。
- 文件是否另存为 UTF-8。

接口会返回导入、新增、跳过和行级错误数量；修正后可重复导入，已存在学生会更新姓名并保留学习记录。

### 学生提交失败

如果页面提示“同步服务器失败”，先确认：

- 学生仍处于登录状态。
- 浏览器能访问 `/api/auth/me`。
- 服务器 `systemctl status zcyl-training` 正常。
- 反代没有拦截 `Cookie` 或 `/api`。

前端不会假装保存成功；本页暂存结果只在当前浏览器有效，刷新后以服务器数据为准。

### 数据恢复

恢复前必须停服务，复制备份库后再启动。恢复后用教师账号登录，随机抽查一个班级导出 CSV，确认学生数和成绩正常。

## 验证

开发或部署后至少执行：

```bash
npm test
npm run build
npm run migrate
npm run seed:teacher
npm run server
```

本地 UI smoke 可在服务启动后执行：

```bash
PROTOTYPE_URL=http://127.0.0.1:8787 node scripts/verify-ui.mjs
```

