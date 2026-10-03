import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';

const artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1366,height:768}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function openLogin() {
  await gotoApp(page,process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await expect(page.locator('#login-username')).toBeVisible();
}
async function logout() {
  await page.locator('.profile-button').click();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();
}
try {
  await openLogin();
  await expect(page.getByRole('heading',{name:'欢迎来到芯游记'})).toBeVisible();
  await expect(page.locator('.login-workshop-image')).toBeVisible();
  assert.ok(await page.locator('.login-workshop-image').evaluate(img=>img.complete&&img.naturalWidth>0),'真实工坊图片加载成功');
  await expect.poll(()=>page.locator('.login-portal').evaluate(el=>el.getAnimations({subtree:true}).every(animation=>['finished','idle'].includes(animation.playState)))).toBe(true);
  for(const viewport of [{width:1366,height:768},{width:1440,height:900},{width:1093,height:614},{width:390,height:844},{width:320,height:720}]) {
    await page.setViewportSize(viewport);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const form=await page.locator('.login-form-panel').boundingBox();
    const demo=await page.locator('.demo-login-button').boundingBox();
    assert.ok(form.x>=0&&form.x+form.width<=viewport.width,'表单位于视口内');
    assert.ok(demo.y+demo.height<=viewport.height,'登录及演示入口无需滚动');
    await page.screenshot({path:path.join(artifacts,`login-redesign-${viewport.width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1366,height:768});
  const student=page.getByRole('tab',{name:'学生入口'}),teacher=page.getByRole('tab',{name:'教师入口'});
  await student.focus();await student.press('ArrowRight');
  await expect(teacher).toBeFocused();await expect(teacher).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#login-username')).toHaveAttribute('placeholder','请输入教师账号');
  await page.screenshot({path:path.join(artifacts,'login-redesign-teacher.png')});
  await teacher.press('Home');await expect(student).toBeFocused();
  await page.locator('#login-password').fill('wrong-password');
  await page.getByRole('button',{name:'显示密码',exact:true}).click();
  await expect(page.locator('#login-password')).toHaveAttribute('type','text');
  await expect(page.locator('#login-password')).toHaveValue('wrong-password');
  await page.getByRole('button',{name:'隐藏密码',exact:true}).click();
  await expect(page.locator('#login-password')).toHaveAttribute('type','password');
  await page.locator('#login-username').fill('demo2026001');
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let loginRequests=0;
  await page.route('**/api/auth/login',async route=>{loginRequests++;await gate;await route.continue();});
  await submitLoginForm(page);
  await expect(page.locator('.login-submit')).toBeDisabled();
  await expect(page.locator('.demo-login-button')).toBeDisabled();
  await expect(page.locator('.login-form-panel')).toHaveAttribute('aria-busy','true');
  await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  await expect.poll(()=>loginRequests).toBe(1);
  release();
  await expect(page.locator('#login-error')).toBeVisible();
  await expect(page.locator('.login-submit')).toBeEnabled();
  await expect(page.locator('#login-username')).toHaveValue('demo2026001');
  await expect(page.locator('#login-password')).toHaveValue('wrong-password');
  await page.screenshot({path:path.join(artifacts,'login-redesign-error.png')});
  await page.unroute('**/api/auth/login');
  await page.locator('#login-password').fill('Student123!');
  await page.locator('#login-password').press('Enter');
  await expect(page.locator('.project-chapter-board')).toBeVisible({timeout:20000});
  await expect(page.locator('.profile-button')).toContainText('演示学生1');
  await logout();await openLogin();
  await teacher.click();
  await fillLoginForm(page,{username:process.env.TEACHER_USERNAME??'teacher',password:process.env.TEACHER_PASSWORD??'ChangeMe123!'});
  await submitLoginForm(page);
  await expect(page.locator('.teacher-reference-shell')).toBeVisible({timeout:20000});
  await logout();await openLogin();
  await page.locator('.demo-login-button').click();
  await expect(page.locator('.project-chapter-board')).toBeVisible({timeout:20000});
  await expect(page.locator('.profile-button')).toContainText('演示学生1');
  await logout();await openLogin();
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.login-story').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.getByRole('button',{name:'先浏览课程',exact:true}).click();
  await expect(page.locator('.project-chapter-board')).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('PASS login design: desktop/narrow/mobile layout, real artwork, role keyboard navigation, password visibility, pending guard, real login failure/retry, student/teacher/demo login, guest return and reduced motion');
} catch(error) {
  await page.screenshot({path:path.join(artifacts,'login-redesign-failure.png'),fullPage:true});throw error;
} finally { await browser.close(); }
