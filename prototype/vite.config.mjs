import { realpathSync } from "node:fs";
import path from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget =
  process.env.PROTOTYPE_API_PROXY_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (
            id.endsWith("/node_modules/three/src/renderers/WebGLRenderer.js")
            || id.includes("/node_modules/three/src/renderers/webgl/")
          ) return "three-renderer";
          if (id.includes("/node_modules/three/src/")) return "three-core";
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
      "/api": apiProxyTarget,
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
