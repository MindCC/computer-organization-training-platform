# 工作树遗留报告归档（2026-09-12）

两个长期未合并的 Git 工作树（`.worktrees/`，被 `.gitignore` 排除）里，`.superpowers/sdd/*.md` 报告一直是**未提交状态**，且其代码改动针对的是 main 早已重写的旧实现。为避免 `git worktree remove`（`--force`）连报告一起丢掉，先把工作副本归档到这里。

| 归档文件 | 来源 | 说明 |
|---|---|---|
| `native-three-task-4-report.md` | `.worktrees/native-three-optimization/.superpowers/sdd/task-4-report.md` | 3D 原生场景任务 4。**已在 main 复核移植**：`writeConnectionEndpoint` + 就地写 `group.position` 见提交 `39e8586`；其 `verify-3d.mjs` 改动针对旧场景，已判定过时。 |
| `native-three-task-2-report.md` | 同上 `task-2-report.md` | 场景状态/资源生命周期抽取；该文件在工作树里是一份较旧的并行版本（比提交版少 102 行），仅留档。 |
| `classroom-mission-task-2-report.md` | `.worktrees/classroom-mission-loop/.superpowers/sdd/task-2-report.md` | 课堂任务环任务 2。main 已经过 `3e93674`/`2634278` 等提交重做课堂流程，报告仅供追溯。 |
| `classroom-mission-task-4-report.md` | 同上 `task-4-report.md` | 同上。 |
| `classroom-mission-task-5-report.md` | 同上 `task-5-report.md` | 同上。 |

## 判定结论（2026-09-12）

- 两个工作树的**代码/脚本改动均不可直接合并**：`nativeComputerScene.js`（main 已重写为装配/探索双模 526 行）与 `verify-classroom.mjs`、`verify-3d.mjs`、`useTeacherSession.js`（main 均已重写或采用不同实现）全部与当前代码错位。
- 仍然有效、需要单独决策的两项：
  1. **3D context-loss 契约未覆盖**：main 的 `qa:3d`（26 项）没有断言 `webglcontextlost` 被 `preventDefault`、以及降级后 canvas 与 `.native-bus-label-layer` 被移除。工作树的检查思路可移植。
  2. **教师轮询是否保留 15s**：工作树把 `useTeacherSession` 轮询从 15s 收紧到 12s（并导出常量 + 单测断言），理由是给响应与渲染留出 15s SLA 余量；但 `prototype/AGENTS.md` 写死的契约是 15s 轮询，改动前需要用户拍板。
