import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

// The original remains available for range requests and clients without compression.
export function staticAssets(distDir) {
  const root = path.resolve(distDir);
  const router = express.Router();
  function cacheHeaders(res, file) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    res.set('Cache-Control', relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : /\.html$/.test(file) ? 'no-cache' : 'public, max-age=3600');
  }
  router.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch { return next(); }
    if (pathname === '/') pathname = '/index.html';
    if (!/\.(js|css|html|svg|json|txt)$/.test(pathname) || /(^|\/)\./.test(pathname)) return next();
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) return next();
    res.vary('Accept-Encoding');
    if (req.headers.range) return next();
    const available = ['br', 'gzip'].filter(encoding => fs.existsSync(`${file}.${encoding === 'br' ? 'br' : 'gz'}`));
    const encoding = req.acceptsEncodings(...available, 'identity');
    if (!available.includes(encoding)) return next();
    res.type(file);
    res.set('Content-Encoding', encoding);
    cacheHeaders(res, file);
    res.sendFile(`${file}.${encoding === 'br' ? 'br' : 'gz'}`, error => { if (error) next(error); });
  });
  router.use(express.static(root, { setHeaders: cacheHeaders }));
  return router;
}
