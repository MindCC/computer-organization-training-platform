/** 初始口令 CSV：课程导入生成的一次性口令需要发放给学生，导出时做公式中和。 */
export function credentialsCsv(items = []) {
  const rows = [
    ["学号", "姓名", "初始密码"],
    ...items.map((item) => [item.username, item.displayName, item.password]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}

export function downloadCredentialsCsv(items = []) {
  const blob = new Blob([`\uFEFF${credentialsCsv(items)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `student-initial-passwords-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
