# 首屏压缩与界面修复（2026-10-06）

## 测量

隔离生产服务、演示数据，Chromium 1366×900；CDP 禁用缓存，等待 networkidle 和字体加载。统计同源 `Network.loadingFinished.encodedDataLength`，包括 HTTP 响应头及页面切换期间的重复请求，不等于部署目录大小。

| 页面 | 修改前 | 修改后 | 减少 |
| --- | ---: | ---: | ---: |
| 匿名首次打开 | 3,561,675 B | 1,229,551 B | 65.5% |
| 学生首页冷刷新 | 4,222,736 B | 1,687,057 B | 60.0% |

此环境未复现首屏 50MB。修改后的 Vite 开发模式学生首页为 12,487,923 B，其中开发图标模块约 6.21MB；不能用开发模块大小判断发布版首屏。首页未加载讲演视频、3D 模型或全部商店素材。脚本 `scripts/verify-first-load.mjs` 可重复测量；真实服务器和设备的时间受网络条件影响。

## 修改

- 2000×2000 品牌素材改用保留构图的小尺寸 WebP，wordmark 555,345 → 27,790 B，logo 219,618 → 4,110 B；原素材保留。
- 地图使用独立的新 URL，565,826 → 380,728 B，保证旧缓存不会继续返回旧图。
- `postbuild` 使用 Node zlib 生成 gzip/Brotli；服务器按 Accept-Encoding/q 值协商。保留原文件、原 MIME、HEAD/ETag、范围请求。没有新运行时依赖。
- 哈希构建资源一年 immutable；非哈希静态素材一小时；HTML no-cache。API 不使用静态缓存规则。
- 原始入口 JS 509,491 / 512,000 B，门禁通过；压缩解决传输体积，原始解析体积并未大幅下降。
- 菜单增加可悬停的间隙桥和 350ms 离开延时；重入保留点击固定；Esc/外部点击/导航清除计时器。
- 章节统一为 8/4/2 列等宽网格，长名称换行；删除两处小芯输入框下的发送说明段落，同步帮助指南。

## 验证

- `node --test server/staticAssets.test.mjs`：压缩协商、q=0、MIME、缓存/304、HEAD、范围/206、缺失压缩文件、路径边界通过。
- `node scripts/run-browser-qa.mjs scripts/verify-navigation-practice.mjs --production --seed-demo`：慢速穿过间隙、移入停留、离开收回、点击固定/重入、Esc；1366/768/390/320 下八章等宽、文字/页面无水平溢出；段落删除通过。
- `node scripts/verify-build-budget.mjs`：入口门禁通过。
- 助教服务/接口及静态压缩共 21 项测试通过。`verify-study-companion.mjs` 生产回归通过：3D 接线错误、修正、自检、课程拒答、所有学生页上下文、390/320 移动端、教师查看隔离。

## 发布验收

合并 Gitee 讲演更新后，最终构建入口原始 JS 509,523 / 512,000 B；冷流量复测匿名 1,229,768 B、学生首页 1,705,528 B。旧表记录优化初轮，刷新过程中重复图片请求会造成少量浮动。

2026-10-06 已推送 Gitee 并部署代码 `0fe1749bf91a480bf7af31c090e62568745a899c`，服务和 SQLite 健康。完整备份：`/var/backups/zcyl/course-scope-20261006-0490606`。未打包共享树中另一项演示名册任务的未提交修改。

首次公网检查发现 Linux 路径包含 `/` 时 `res.type(file)` 被当成 MIME 字符串，已改为扩展名查找 `res.type(path.extname(file))` 并更新服务；本地 Windows 和生产 Linux 静态资源测试均通过。公网原始 HTTP 验收：入口 gzip 166,637 B、MIME 正确、Vary/缓存正常、q=0 回退正常、范围请求 206。

公网浏览器验收真实模型课程回答 `source=ai`；无关、关键词伪装、混合要求、指令覆盖四类拒答通过；段落删除、慢速菜单间隙、桌面及390/320章节等宽与无溢出通过，页面脚本错误为0。由于本机 Chromium 直连公网存在超时，此项通过 Node fetch 转发同一公网资源和 API；不是端到端网络耗时测量。

日志和截图在 gitignored `qa-artifacts`。生产回归使用冻结的 dist 快照。发布仍需以 Gitee 确认及服务器健康/版本、真实 API 验收为准。
