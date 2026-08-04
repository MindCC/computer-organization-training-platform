/**
 * 密码强度检测（P2-E）。
 * 弱：长度 < 8 或缺少数字/特殊字符
 * 中：长度 >= 8 且包含字母+数字或特殊字符
 * 强：长度 >= 10 且包含字母+数字+特殊字符
 * 返回 { score: 'weak'|'medium'|'strong', label, color }
 */
export function passwordStrength(password = "") {
  const text = String(password);
  const length = text.length;
  const hasLower = /[a-z]/.test(text);
  const hasUpper = /[A-Z]/.test(text);
  const hasLetter = hasLower || hasUpper;
  const hasDigit = /[0-9]/.test(text);
  const hasSpecial = /[^A-Za-z0-9]/.test(text);
  const variety = Number(hasLower) + Number(hasUpper) + Number(hasDigit) + Number(hasSpecial);

  let score = "weak";
  if (length >= 8 && hasLetter && (hasDigit || hasSpecial)) {
    score = "medium";
  }
  if (length >= 10 && hasLetter && hasDigit && hasSpecial) {
    score = "strong";
  }
  return {
    score,
    label: score === "strong" ? "强" : score === "medium" ? "中" : "弱",
  };
}
