/**
 * Circuit Fault Injection Engine
 *
 * Three fault types, seeded for reproducibility:
 * - BROKEN_WIRE: remove a required edge (student must reconnect)
 * - REVERSED_WIRE: flip an edge direction (student must correct)
 * - MISSING_COMPONENT: remove a non-I/O node (student must re-add)
 *
 * Teacher can fix a seed to reproduce the same fault for all students.
 */

export const FAULT_TYPES = Object.freeze({
  BROKEN_WIRE: "broken_wire",
  REVERSED_WIRE: "reversed_wire",
  MISSING_COMPONENT: "missing_component",
});

/**
 * Simple seeded PRNG (mulberry32).
 */
function createRng(seed) {
  let state = seed | 0;
  return () => {
    state |= 0; state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Inject faults into a circuit model's required edges.
 * @param {Object} model - circuit model with requiredEdges and nodes
 * @param {Object} options - { seed?: number, faultCount?: number, faultTypes?: string[] }
 * @returns {{ faults: Array, modifiedEdges: Array, description: string }}
 */
export function injectFaults(model, options = {}) {
  const seed = options.seed ?? Date.now();
  const faultCount = Math.min(options.faultCount ?? 2, 5);
  const allowedTypes = options.faultTypes ?? [FAULT_TYPES.BROKEN_WIRE, FAULT_TYPES.REVERSED_WIRE];
  const rng = createRng(seed);

  const edges = model?.requiredEdges ? [...model.requiredEdges] : [];
  const nodes = (model?.nodes ?? []);
  const componentNodes = nodes.filter((n) => n.type !== "input" && n.type !== "output");
  const faults = [];
  const modifiedEdges = structuredClone ? structuredClone(edges) : JSON.parse(JSON.stringify(edges));

  for (let i = 0; i < faultCount && edges.length > 0; i++) {
    const type = pickRandom(allowedTypes, rng);

    if (type === FAULT_TYPES.BROKEN_WIRE && modifiedEdges.length > 0) {
      const idx = Math.floor(rng() * modifiedEdges.length);
      const removed = modifiedEdges.splice(idx, 1)[0];
      faults.push({
        type: FAULT_TYPES.BROKEN_WIRE,
        edge: removed,
        description: `"${removed.hint?.type ?? "连线断开"}"：${removed.hint?.message ?? "一条必要连线已断开。"}`,
      });
    } else if (type === FAULT_TYPES.REVERSED_WIRE && modifiedEdges.length > 0) {
      const idx = Math.floor(rng() * modifiedEdges.length);
      modifiedEdges[idx] = {
        ...modifiedEdges[idx],
        from: { ...modifiedEdges[idx].to },
        to: { ...modifiedEdges[idx].from },
      };
      faults.push({
        type: FAULT_TYPES.REVERSED_WIRE,
        edge: modifiedEdges[idx],
        description: "一条连线的方向被反转，信号无法正确传递。",
      });
    } else if (type === FAULT_TYPES.MISSING_COMPONENT && componentNodes.length > 0) {
      const node = pickRandom(componentNodes, rng);
      // Remove all edges connected to this node
      const before = modifiedEdges.length;
      const removed = modifiedEdges.filter(
        (e) => e.from.nodeId !== node.id && e.to.nodeId !== node.id
      );
      if (removed.length < modifiedEdges.length) {
        modifiedEdges.length = 0;
        modifiedEdges.push(...removed);
        faults.push({
          type: FAULT_TYPES.MISSING_COMPONENT,
          node: { id: node.id, label: node.label },
          description: `元件"${node.label}"已失效，相关连线已断开。`,
        });
      }
    }
  }

  return {
    seed,
    faults,
    modifiedEdges,
    originalEdges: edges,
    description: faults.map((f) => f.description).join("；"),
  };
}

/**
 * Verify that fixing the faults restores all test cases to passing.
 */
export function verifyFaultFix(model, fixedEdges, injectedFaults) {
  const faults = injectedFaults?.faults ?? [];
  const allOriginal = model?.requiredEdges ?? [];
  const fixedKeys = new Set(fixedEdges.map((e) => `${e.from.nodeId}:${e.from.portId}->${e.to.nodeId}:${e.to.portId}`));
  const allPresent = allOriginal.every((e) => fixedKeys.has(`${e.from.nodeId}:${e.from.portId}->${e.to.nodeId}:${e.to.portId}`));

  return {
    fixed: allPresent,
    remainingFaults: faults.filter((f) => f.type !== FAULT_TYPES.MISSING_COMPONENT).length,
    message: allPresent ? "所有故障已修复！" : "仍有故障未修复，请继续检查。",
  };
}
