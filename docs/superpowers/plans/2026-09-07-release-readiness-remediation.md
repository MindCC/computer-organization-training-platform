# 发布就绪整改计划

## 目标

在不包含真实课堂硬件验证的前提下，消除发布前审计发现的权限、项目提交、教师评价、课堂生产回归、依赖审计和文档问题。

## 范围

1. 路由只采用会话身份和 URL 资源标识，忽略请求体中的身份与资源 ID。
2. 学生修改已提交里程碑时生成新的幂等标识；同一网络重试仍保持原标识。
3. 教师班级工作台显示待评价成果，并可提交评价。
4. 课堂 Playwright 流程匹配当前界面，并通过生产构建执行。
5. 根据 `npm audit` 的修复版本升级锁定依赖。
6. 更新发布就绪说明和执行命令。

## 受影响文件

- `prototype/server/courseWorkbenchRoutes.js` 与路由测试
- `prototype/src/components/StudentProjects.jsx`
- `prototype/server/courseWorkbenchRepository.js`、`courseWorkbenchService.js`、`TeacherCourseWorkbench.jsx`、`apiClient.js`
- `prototype/scripts/verify-classroom.mjs`、`prototype/package.json`
- `prototype/package-lock.json`、`README.md`、`docs/project-readiness-2026-09-06.md`

## 风险与验收

- 身份字段必须由已认证会话决定；跨班、跨项目访问返回现有的拒绝语义。
- 编辑后仅更新该学生该里程碑；请求重试不得重复写入。
- 评价接口仍校验教师拥有项目，已评价成果不可重复评价。
- 执行单元测试、生产课堂浏览器流程、构建预算与依赖审计；真实教室设备验证明确不在本次范围。
