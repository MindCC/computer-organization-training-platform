/** 教师看板「选择班级」下拉框操作辅助：按班级名部分匹配选中选项。 */
export async function selectTeacherClass(page, className, { timeout = 10_000 } = {}) {
  const select = page.locator(".teacher-class-select select");
  await select.waitFor({ state: "visible", timeout });
  const options = select.locator("option");
  const count = await options.count();
  for (let index = 0; index < count; index += 1) {
    const label = (await options.nth(index).textContent()) ?? "";
    if (label.includes(className)) {
      await select.selectOption({ index });
      return true;
    }
  }
  return false;
}

/** 选中下拉框里的第一个班级。 */
export async function selectFirstTeacherClass(page, { timeout = 10_000 } = {}) {
  const select = page.locator(".teacher-class-select select");
  await select.waitFor({ state: "visible", timeout });
  await select.selectOption({ index: 0 });
}
