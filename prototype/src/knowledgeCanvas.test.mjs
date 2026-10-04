import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerConceptCamera, fitConceptCamera, zoomConceptCamera } from './knowledgeCanvas.js';
import { layoutKnowledgeGraph } from './knowledgePoints.js';

test('zoom preserves the graph coordinate underneath the cursor, including limits', () => {
  const camera = { x: -160, y: 34, zoom: 0.7 }, anchor = { x: 220, y: 180 };
  for (const requested of [0.01, 1.4, 100]) {
    const next = zoomConceptCamera(camera, requested, anchor);
    assert.ok(next.zoom >= 0.15 && next.zoom <= 3);
    assert.ok(Math.abs((anchor.x - camera.x) / camera.zoom - (anchor.x - next.x) / next.zoom) < 1e-9);
    assert.ok(Math.abs((anchor.y - camera.y) / camera.zoom - (anchor.y - next.y) / next.zoom) < 1e-9);
  }
});
test('fit shows every complete concept card in all eight chapters on desktop and phone', () => {
  for (const width of [358, 640, 1100]) for (let chapter = 1; chapter <= 8; chapter++) {
    const model = layoutKnowledgeGraph({ chapterId: 'ch' + chapter, width: 920, height: 620 });
    const camera = fitConceptCamera(model.nodes, { width, height: 460 });
    for (const node of model.nodes) {
      assert.ok(camera.x + (node.x - 88) * camera.zoom >= 31.9);
      assert.ok(camera.x + (node.x + 88) * camera.zoom <= width - 31.9);
      assert.ok(camera.y + (node.y - 38) * camera.zoom >= 31.9);
      assert.ok(camera.y + (node.y + 38) * camera.zoom <= 428.1);
    }
  }
});
test('locating a concept restores readable scale and centers it without changing graph data', () => {
  const node = { x: 730, y: 400 }, viewport = { width: 640, height: 460 };
  const camera = centerConceptCamera({ x: 0, y: 0, zoom: 0.2 }, node, viewport, true);
  assert.equal(camera.zoom, 0.85);
  assert.equal(camera.x + node.x * camera.zoom, viewport.width / 2);
  assert.equal(camera.y + node.y * camera.zoom, viewport.height / 2);
  assert.deepEqual(node, { x: 730, y: 400 });
  assert.deepEqual(fitConceptCamera([], viewport), { x: 320, y: 230, zoom: 1 });
});
