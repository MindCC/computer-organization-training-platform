const DEFAULT_BITS = 4;
const DEFAULT_CASES = [-5, -3, -1, 0, 3, 5, 7];

export function encodeSignedInteger(value, bits = DEFAULT_BITS) {
  const normalizedValue = Number(value);
  const magnitudeWidth = bits - 1;
  const maxSignMagnitude = (2 ** magnitudeWidth) - 1;
  const minTwosComplement = -(2 ** magnitudeWidth);
  const maxTwosComplement = (2 ** magnitudeWidth) - 1;
  const overflow = !Number.isInteger(normalizedValue) || normalizedValue < minTwosComplement || normalizedValue > maxTwosComplement;

  if (overflow) {
    return {
      value: normalizedValue,
      bits,
      signMagnitude: null,
      onesComplement: null,
      twosComplement: null,
      overflow: true,
    };
  }

  const magnitude = Math.abs(normalizedValue);
  const magnitudeBits = toBinary(magnitude, magnitudeWidth);
  const positiveBits = `0${magnitudeBits}`;

  if (normalizedValue >= 0) {
    return {
      value: normalizedValue,
      bits,
      signMagnitude: positiveBits,
      onesComplement: positiveBits,
      twosComplement: positiveBits,
      overflow: false,
    };
  }

  const signMagnitude = magnitude > maxSignMagnitude ? null : `1${magnitudeBits}`;
  const onesComplement = signMagnitude ? invertBits(`0${magnitudeBits}`) : null;
  const twosComplement = toBinary((2 ** bits) + normalizedValue, bits);

  return {
    value: normalizedValue,
    bits,
    signMagnitude,
    onesComplement,
    twosComplement,
    overflow: false,
  };
}

export function gradeMachineNumberAnswer(value, answer, bits = DEFAULT_BITS) {
  const expected = encodeSignedInteger(value, bits);
  if (expected.overflow) {
    return {
      passed: false,
      score: 0,
      expected,
      errors: [{ type: "表示范围溢出", message: `${value} 超出 ${bits} 位补码可表示范围。` }],
    };
  }

  const checks = [
    ["signMagnitude", "符号位错误", "原码应当先写符号位，再写数值位。"],
    ["onesComplement", "反码错误", "负数反码是在原码数值位逐位取反，正数反码与原码相同。"],
    ["twosComplement", "补码错误", "负数补码是在反码基础上加 1，正数补码与原码相同。"],
  ];
  const errors = checks
    .filter(([key]) => normalizeBits(answer?.[key]) !== expected[key])
    .map(([, type, message]) => ({ type, message }));

  return {
    passed: errors.length === 0,
    score: Math.round(((checks.length - errors.length) / checks.length) * 100),
    expected,
    errors,
  };
}

export function buildMachineNumberExercise(values = DEFAULT_CASES, bits = DEFAULT_BITS) {
  return {
    bits,
    cases: values.map((value) => ({
      value,
      expected: encodeSignedInteger(value, bits),
      prompt: `${value} 的 ${bits} 位机器数表示`,
    })),
  };
}

function toBinary(value, width) {
  return value.toString(2).padStart(width, "0").slice(-width);
}

function invertBits(bits) {
  return bits.replace(/[01]/g, (bit) => (bit === "0" ? "1" : "0"));
}

function normalizeBits(value) {
  return String(value ?? "").replace(/\s+/g, "");
}
