import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Under udvikling proxyer Vite /dav/ til Radicale, præcis som nginx gør i containeren.
const radicale = process.env.RADICALE_URL ?? "http://127.0.0.1:5232";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/dav": {
        target: radicale,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dav/, "") || "/",
        headers: { "X-Script-Name": "/dav" },
        configure: (proxy) => {
          // Uden dette viser browseren sin egen login-boks oven i appens.
          proxy.on("proxyRes", (res) => { delete res.headers["www-authenticate"]; });
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
