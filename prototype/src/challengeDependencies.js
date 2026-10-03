/**
 * 关卡依赖树（仿图灵完备 Turing Complete 的进度模型）：
 * 你造出的元件是后续关卡的积木——一个关卡只有在它的全部依赖都完成后才解锁。
 *
 * 结构概览（自底向上）：
 *   整机探索/程序流程 → 机器数 → 数据流 → 逻辑门(与/或/非/异或)
 *   门 → 半加 / 多路选择 → 全加 → 多位加法 / ALU
 *   机器数 → 存储器 → 指令与数据 → CPU → 总线 → I/O
 */
import { WORKBENCH_CHALLENGES } from './workbenchChallenges.js';
export const CHALLENGE_DEPS = Object.freeze({
  ...Object.fromEntries(WORKBENCH_CHALLENGES.map(item=>[item.id,item.prerequisites])),
  "computer-components": [],
  "program-flow": ["computer-components"],
  "machine-number": ["program-flow"],
  "data-flow": ["machine-number"],
  "and-gate": ["data-flow"],
  "or-gate": ["data-flow"],
  "not-gate": ["data-flow"],
  "xor-gate": ["data-flow"],
  "memory-address": ["machine-number"],
  "half-adder": ["xor-gate", "and-gate"],
  "mux": ["and-gate", "or-gate", "not-gate"],
  "instruction-data": ["memory-address"],
  "full-adder": ["half-adder", "or-gate"],
  "multi-adder": ["full-adder"],
  "alu": ["full-adder", "mux"],
  "cpu-datapath": ["alu", "instruction-data"],
  "system-bus": ["cpu-datapath"],
  "io-transfer": ["system-bus"],
});

export function dependenciesOf(challengeId) {
  return CHALLENGE_DEPS[challengeId] ?? [];
}

/** 某关是否已满足解锁条件（全部依赖均已完成）。 */
export function isUnlocked(challengeId, progress = {}) {
  return dependenciesOf(challengeId).every((dep) => progress?.[dep]?.status === "completed");
}

/**
 * 依赖一致性修复（读时归一）：
 * 解锁口径从「线性下一关」改为「依赖驱动」后，历史学情里可能有「依赖早已完成、却仍标 locked」的关卡。
 * 这里把这类关卡就地升级为 in-progress（不写库，只在返回给客户端前归一）。
 */
export function reconcileDependencyLocks(progress = {}) {
  const next = structuredClone(progress ?? {});
  for (const id of Object.keys(CHALLENGE_DEPS)) {
    const record = next[id];
    if (record && record.status === "locked" && isUnlocked(id, next)) {
      record.status = "in-progress";
    }
  }
  return next;
}

/** 拓扑深度（树状地图的层级；无依赖为 0，逐级 +1）。 */
export function dependencyDepth(challengeId) {
  const memo = new Map();
  const depth = (id, seen) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return 0; // 防御环
    seen.add(id);
    const deps = dependenciesOf(id);
    const value = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((dep) => depth(dep, seen)));
    memo.set(id, value);
    return value;
  };
  return depth(challengeId, new Set());
}

export function dependencyDepths(challengeIds = []) {
  return Object.fromEntries(challengeIds.map((id) => [id, dependencyDepth(id)]));
}
