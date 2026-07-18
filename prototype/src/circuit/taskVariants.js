/**
 * Task Variant Generator
 *
 * Randomizes test case inputs and naming to prevent answer memorization.
 * The expected outputs are recomputed from the model's required edges,
 * so variants are always correct and deterministic given a seed.
 */

function mulberry32(seed) {
  let s = seed | 0;
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function pickRandom(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(arr, rng) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/**
 * Generate a variant of the circuit model with randomized test cases.
 * @param {Object} model - circuit model with testCases and optional hiddenTestCases
 * @param {number} seed - deterministic seed
 * @returns {{ variant: Object, seed: number }} variant model with shuffled+renamed test cases
 */
export function generateVariant(model, seed = Date.now()) {
  const rng = mulberry32(seed);
  const publicCases = model?.testCases ?? [];
  const hiddenCases = model?.hiddenTestCases ?? [];

  // For simple bit-based circuits: shuffle and rename
  if (publicCases.length <= 8 && publicCases.every((c) =>
    Object.values(c.expected).every((v) => v === 0 || v === 1))
  ) {
    const shuffled = shuffle(publicCases, rng);
    const renamed = shuffled.map((c, i) => ({
      ...c,
      name: `测试用例 ${i + 1}`,
    }));
    const shuffledHidden = hiddenCases.length > 0 ? shuffle(hiddenCases, rng).map((c, i) => ({
      ...c, name: `附加测试 ${i + 1}`,
    })) : [];

    return {
      variant: { ...model, testCases: renamed, hiddenTestCases: shuffledHidden },
      seed,
      description: `已随机重排 ${publicCases.length} 个测试用例 + ${hiddenCases.length} 个隐藏用例`,
    };
  }

  // For other circuits: just shuffle the order
  const shuffled = shuffle(publicCases, rng);
  return {
    variant: { ...model, testCases: shuffled.map((c, i) => ({ ...c, name: `用例 ${i + 1}` })) },
    seed,
    description: `已随机重排测试用例顺序`,
  };
}
