# 教师拍照上传作业

入口：教师看板 → 作业管理 → 拍照上传作业；已有草稿的“拍照识别”标签也可使用。

支持相机拍照及 PNG / JPEG / WebP 图片选择，按上传顺序识别最多 3 张图片，每张不超过 5MB、合计不超过 10MB、每次最多 50 题。调用前由教师确认发送所选图片并遮挡个人信息；不会附加账号、班级、学生记录或成绩。原图仅在识别请求和当前页面内使用，不持久化。

视觉大模型识别题干、选项、章节、题型、分值；有图片参考答案时提取，未给出答案时独立解答并提供解析。题干不清或缺少条件时提示补充，不能编造缺失题干。教师可编辑全部题目字段、勾选需要的题目，人工确认答案是可选操作，未确认的 AI 答案也可保存；其来源和未确认状态会保留在题库解析及作业解析中。

提供“仅加入题库”“仅加入作业库”“同时加入题库和作业库”。加入作业库保存为当前班级草稿或加入已有草稿，由现有发布按钮发布。批次保存使用事务及教师范围的幂等键；失败保留候选内容，同批次重试不会重复录入。已发布作业不可追加，其他教师的作业不可访问，演示账户继续只读。

默认复用 `MINDMAP_VISION_*` 视觉配置。可通过 `HOMEWORK_VISION_API_KEY`、`HOMEWORK_VISION_BASE_URL`、`HOMEWORK_VISION_MODEL`、`HOMEWORK_VISION_TIMEOUT_MS` 单独配置，密钥只在服务端读取。未配置时页面明确说明服务不可用。反向代理须允许至少 15MB 请求体。

验证命令：

```powershell
node --test --test-concurrency=1 server/assignmentPhoto.test.mjs server/assignment.test.mjs server/questionBank.test.mjs server/demoReadOnly.test.mjs
npm run build
node scripts/run-browser-qa.mjs scripts/verify-assignment-photos.mjs
```

自动化识别使用模拟视觉返回，以验证请求边界、可编辑候选、失败处理、可选确认及入库流程；浏览器保存使用临时隔离数据库。未执行真实视觉模型或生产环境验收。

2026-10-08 验证结果：相关后端 24 项测试通过（含新增拍照作业 7 项），前端生产构建通过，单 Chromium 的电脑和 390px 手机流程通过；普通 HTTP 环境缺少 `crypto.randomUUID` 的情况也覆盖。最终将保存端点的 JSON 限制独立设为 2MB，补测通过 50 道长中文选择题的批量保存，识别端点限制为 15MB。
