/**
 * Chip Component Definitions — completed circuits become reusable black-box chips.
 *
 * When a student completes a challenge (e.g., half-adder), the corresponding chip
 * is unlocked and can be used as a component in higher-level challenges.
 */

export const CHIP_DEFINITIONS = Object.freeze({
  "half-adder": {
    id: "half-adder",
    challengeId: "half-adder",
    label: "半加器",
    description: "1 位二进制加法（无进位输入）",
    ports: [
      { id: "a", label: "A", direction: "in" },
      { id: "b", label: "B", direction: "in" },
      { id: "sum", label: "S", direction: "out" },
      { id: "carry", label: "C", direction: "out" },
    ],
    simulation: ({ a, b }) => {
      const total = (a & 1) + (b & 1);
      return { sum: total & 1, carry: total > 1 ? 1 : 0 };
    },
  },
  "full-adder": {
    id: "full-adder",
    challengeId: "full-adder",
    label: "全加器",
    description: "带进位输入的 1 位加法器",
    ports: [
      { id: "a", label: "A", direction: "in" },
      { id: "b", label: "B", direction: "in" },
      { id: "cin", label: "Cin", direction: "in" },
      { id: "sum", label: "S", direction: "out" },
      { id: "cout", label: "Cout", direction: "out" },
    ],
    simulation: ({ a, b, cin }) => {
      const total = (a & 1) + (b & 1) + (cin & 1);
      return { sum: total & 1, cout: total > 1 ? 1 : 0 };
    },
  },
  "and-gate": {
    id: "and-gate",
    challengeId: "and-gate",
    label: "与门",
    description: "两输入都为 1 时输出 1",
    ports: [
      { id: "a", label: "A", direction: "in" },
      { id: "b", label: "B", direction: "in" },
      { id: "c", label: "Y", direction: "out" },
    ],
    simulation: ({ a, b }) => ({ c: (a & 1) & (b & 1) }),
  },
  "or-gate": {
    id: "or-gate",
    challengeId: "or-gate",
    label: "或门",
    description: "至少一个输入为 1 时输出 1",
    ports: [
      { id: "a", label: "A", direction: "in" },
      { id: "b", label: "B", direction: "in" },
      { id: "out", label: "Y", direction: "out" },
    ],
    simulation: ({ a, b }) => ({ out: (a & 1) | (b & 1) }),
  },
  "xor-gate": {
    id: "xor-gate",
    challengeId: "xor-gate",
    label: "异或门",
    description: "两输入不同时输出 1",
    ports: [
      { id: "a", label: "A", direction: "in" },
      { id: "b", label: "B", direction: "in" },
      { id: "s", label: "Y", direction: "out" },
    ],
    simulation: ({ a, b }) => ({ s: (a & 1) ^ (b & 1) }),
  },
  "not-gate": {
    id: "not-gate",
    challengeId: "not-gate",
    label: "非门",
    description: "输入取反",
    ports: [
      { id: "in", label: "A", direction: "in" },
      { id: "out", label: "Y", direction: "out" },
    ],
    simulation: ({ inp }) => ({ out: (inp & 1) ^ 1 }),
  },
});

/**
 * Returns the chips unlocked by the student based on completed challenges.
 * @param {Object} progress — student progress object, keyed by challengeId
 * @returns {Array} array of unlocked chip definitions
 */
export function getUnlockedChips(progress = {}) {
  const safe = progress ?? {};
  return Object.values(CHIP_DEFINITIONS).filter((chip) => {
    const record = safe[chip.challengeId];
    return record?.status === "completed";
  });
}

/**
 * Given a list of unlocked chips, build placement palette entries.
 */
export function buildChipPalette(unlockedChips) {
  return unlockedChips.map((chip) => ({
    id: `chip:${chip.id}`,
    componentName: `chip:${chip.id}`,
    displayLabel: chip.label,
    role: chip.description,
    sourceIndex: -1, // chips don't have a source index
    isChip: true,
  }));
}
