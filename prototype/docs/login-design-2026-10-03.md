# 登录页设计与验证

## 设计依据

用户希望登录页符合整体风格，具有设计感，并借鉴优秀线上产品。原界面使用紫黑背景和金色操作，与当前平台的白色顶栏、浅色工作区、青绿交互及暖阳装机店不一致。

实际浏览并截图的官方参考：

- [Vercel 登录](https://vercel.com/login)：明确标题、紧凑表单、主操作与其他入口的层次。
- [Linear 登录](https://linear.app/login)：克制内容与一致的按钮节奏。
- [Notion 登录](https://app.notion.com/login)：品牌、标题、输入和操作之间的留白。

参考截图在 `qa-artifacts/login-research/`。借鉴排版原则，沿用平台自己的品牌、真实图片和账号流程；没有添加参考网站的第三方认证功能。

## 实现

- 白色品牌栏，保留先浏览课程入口。
- 大屏左侧展示自有 `shop-empty.webp` 暖阳工坊，右侧为独立清晰的账号区域。主操作青绿，演示入口使用浅绿描边；标题为「把原理，亲手装出来」。
- 保留学生、教师身份切换及方向键导航；保留账号与密码自动填充。新增密码显示/隐藏及登录等待反馈，等待期间防止重复提交，错误后保留输入并允许重试。
- 1366×768、1440×900、1093×614 下登录和演示操作可见；手机表单排到场景前，320px 下标题分为两行。减少动画设置关闭入场与旋转动画。
- 实际 UI 改动限于 `LoginPortal.jsx` / `LoginPortal.css`。未修改服务端认证、权限、教师账号或演示账号。

## 验证

2026-10-03 当前工作树，Windows 稳定 Edge，单个无头浏览器，生产构建及隔离 SQLite 演示数据。

- `npm run build -- --manifest` 成功。
- `node scripts/run-browser-qa.mjs scripts/verify-login-design.mjs --production --seed-demo` PASS；下次可使用 `npm run qa:login`。
- 验证真实学生/教师/演示登录、真实错误密码与重试、等待时单次请求、Enter 提交、身份方向键、密码切换、游客返回、减少动画、图片加载及上述五种视口无横向溢出。
- 最终截图等待入场动画结束；1440×900 实现与同尺寸 Vercel 参考在同一检查输入中比较，复查层级、排版、可读性、边距与入口；同时查看手机及错误状态。属于结合现有平台的重新设计，不是逐像素复刻参考。
- 浏览器 pageerror 为空。初始 JavaScript 489315B / 512000B，在项目既有预算内。3D 模型与课堂生命周期未改动，沿用此前已通过的相关证据。
- 日志：`qa-artifacts/login-build.log`、`login-redesign.log`。截图：`login-redesign-1366.png`、`login-redesign-1440.png`、`login-redesign-1093.png`、`login-redesign-390.png`、`login-redesign-320.png`、`login-redesign-teacher.png`、`login-redesign-error.png`。
