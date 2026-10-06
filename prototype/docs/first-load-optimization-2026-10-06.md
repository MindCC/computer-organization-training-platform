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

日志和截图在 gitignored `qa-artifacts`。生产回归使用冻结的 dist 快照。发布仍需以 Gitee 确认及服务器健康/版本、真实 API 验收为准。
