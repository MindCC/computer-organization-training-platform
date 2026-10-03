import { realpathSync } from "node:fs";
import path from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { hostedDemoMiddleware } from "./src/shared/demoNavigation.js";

const apiProxyTarget =
  process.env.PROTOTYPE_API_PROXY_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  resolve: { alias: [{ find: /^three$/, replacement: path.resolve("node_modules/three/src/Three.js") }] },
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          // Math/constants have no dependency on the renderer or scene graph.
          // Splitting the renderer from core creates a cycle with eager initializers.
          if (id.includes('/node_modules/three/src/')) {
            if (id.includes('/src/loaders/') || id.includes('/src/animation/')) return 'three-assets';
            if (id.includes('/src/math/') || /\/src\/(constants|utils)\.js$/.test(id)) return 'three-math';
            return 'three-runtime';
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(path.resolve("node_modules"))],
    },
    proxy: {
      // changeOrigin: false 保留浏览器原始 Host（5173），
      // 让后端 CSRF 的 Origin 校验能匹配前端地址，避免"跨站请求被拒绝"。
      "/api": { target: apiProxyTarget, changeOrigin: false },
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), { name:"platform-demo-navigation", configureServer(server) { server.middlewares.use(hostedDemoMiddleware); }, configurePreviewServer(server) { server.middlewares.use(hostedDemoMiddleware); } }],
});
