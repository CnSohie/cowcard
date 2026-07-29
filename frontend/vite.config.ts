import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/files": "http://127.0.0.1:8080", // 上传图片静态资源
    },
  },
  build: {
    // 2C2G:构建产物按 vendor 拆包,配合 Nginx 强缓存
    rollupOptions: {
      output: {
        manualChunks: { vendor: ["react", "react-dom", "react-router-dom", "axios"] },
      },
    },
  },
});
