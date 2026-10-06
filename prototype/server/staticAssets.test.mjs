import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { gzipSync, brotliCompressSync, gunzipSync, brotliDecompressSync } from 'node:zlib';
import express from 'express';
import { staticAssets } from './staticAssets.js';

test('static assets negotiate compression, caching, HEAD and byte ranges', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zcyl-static-'));
  await mkdir(path.join(root, 'assets'));
  const data = Buffer.from('export const text="课程";'.repeat(200));
  const file = path.join(root, 'assets', 'index-hash.js');
  await Promise.all([writeFile(file, data), writeFile(`${file}.gz`, gzipSync(data)), writeFile(`${file}.br`, brotliCompressSync(data)), writeFile(path.join(root, 'index.html'), '<html>hello</html>'),writeFile(path.join(root,'plain.css'),'body{}')]);
  const app = express(); app.use(staticAssets(root));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    http.request({ host: '127.0.0.1', port: server.address().port, path: url, headers, method }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject).end();
  });
  try {
    for (const [accept, encoding] of [['br, gzip', 'br'], ['gzip, br;q=0', 'gzip'], ['br;q=0.2,gzip;q=0.9', 'gzip']]) {
      const res = await request('/assets/index-hash.js', { 'Accept-Encoding': accept });
      assert.equal(res.status, 200); assert.equal(res.headers['content-encoding'], encoding);
      assert.match(res.headers['content-type'], /javascript/); assert.match(res.headers.vary, /Accept-Encoding/);
      assert.match(res.headers['cache-control'], /immutable/);
      assert.deepEqual((encoding === 'br' ? brotliDecompressSync : gunzipSync)(res.body), data);
    }
    const identity = await request('/assets/index-hash.js', { 'Accept-Encoding': 'br;q=0,gzip;q=0' });
    assert.equal(identity.headers['content-encoding'], undefined); assert.deepEqual(identity.body, data);
    const range = await request('/assets/index-hash.js', { Range: 'bytes=0-9', 'Accept-Encoding': 'br' });
    assert.equal(range.status, 206); assert.equal(range.headers['content-encoding'], undefined); assert.deepEqual(range.body, data.subarray(0, 10));
    const head = await request('/assets/index-hash.js', { 'Accept-Encoding': 'gzip' }, 'HEAD');
    assert.equal(head.headers['content-encoding'], 'gzip'); assert.equal(head.body.length, 0);
    const cached = await request('/assets/index-hash.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': head.headers.etag });
    assert.equal(cached.status, 304);
    assert.equal((await request('/index.html')).headers['cache-control'], 'no-cache');
    const plain = await request('/plain.css', { 'Accept-Encoding': 'br' });
    assert.equal(plain.status, 200); assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal((await request('/%2e%2e/private.js')).status, 404);
    assert.equal((await request('/.vite/manifest.json')).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
});
