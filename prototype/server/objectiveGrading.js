// Keep homework remediation consistent with the original submission grader.
export function gradeObjectiveAnswer(type, value, answer) {
  if (type === "choice") return String(value) === String(answer);
  if (type === "truefalse") return String(value).toLowerCase() === String(answer).toLowerCase();
  if (type === "fill") return String(value ?? "").trim() === String(answer ?? "").trim();
  return false;
}
