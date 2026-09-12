import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const sceneSource = await (await fetch('/src/components/nativeComputerScene.js')).text();
    const cameraModule = sceneSource.match(/import\s*\{\s*PerspectiveCamera\s*\}\s*from\s*["']([^"']+)["']/)[1];
    const { PerspectiveCamera } = await import(cameraModule);
    const { createNativeComputerScene } = await import('/src/components/nativeComputerScene.js');
    const original = PerspectiveCamera.prototype.lookAt;
    let current;
    PerspectiveCamera.prototype.lookAt = function (...args) {
      original.apply(this, args);
      current = { position: this.position.toArray(), rotation: this.quaternion.toArray(), target: args[0].toArray() };
    };
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;width:1000px;height:650px';
    document.body.append(container);
    const scene = createNativeComputerScene(container, { assembly: true });
    const canvas = container.querySelector('canvas');
    // Synthetic pointers have no active browser capture; exercise the actual handlers.
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    const before = current;
    function drag(button) {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button, clientX: 500, clientY: 300, cancelable: true }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { button, clientX: 560, clientY: 330 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { button, clientX: 560, clientY: 330 }));
      return current;
    }
    const middle = drag(1);
    const left = drag(0);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    const zoom = current;
    scene.dispose();
    container.remove();
    PerspectiveCamera.prototype.lookAt = original;
    return { before, middle, left, zoom };
  });
  const close = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  assert.ok(!close(result.before.position, result.middle.position), 'middle drag moves camera');
  assert.ok(close(result.before.rotation, result.middle.rotation), 'middle drag preserves orientation');
  assert.ok(close(result.before.position.map((x, i) => result.middle.position[i] - x), result.before.target.map((x, i) => result.middle.target[i] - x)), 'camera and target translate equally');
  assert.ok(!close(result.middle.rotation, result.left.rotation), 'left drag still rotates');
  assert.ok(!close(result.left.position, result.zoom.position), 'wheel still zooms');
  console.log('PASS: middle pans without rotation; left rotates; wheel zooms');
} finally {
  await browser.close();
}
