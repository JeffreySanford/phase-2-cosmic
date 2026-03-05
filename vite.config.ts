import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Dev proxy to forward HiPS property requests (CORS) to the upstream IRSA host.
// This keeps the browser from being blocked during local development.
export default defineConfig({
  plugins: [tsconfigPaths()],
  server: {
    proxy: {
      // Aladin Lite requests like /data/hips/CDS/.../properties
      "/data/hips": {
        target: "https://irsa.ipac.caltech.edu",
        changeOrigin: true,
        secure: true,
        // path is forwarded as-is
      },
      // Optional alias if needed by other mirrors
      "/hips-proxy": {
        target: "https://irsa.ipac.caltech.edu",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/hips-proxy/, ""),
      },
      // Forward local `/api/proxy/*` requests to the running Nest backend (or set NEST_PROXY env)
      // Useful for development so the Vite dev server doesn't serve the SPA index for these API calls.
      "/api/proxy": {
        target: process.env.NEST_PROXY || "http://localhost:3000",
        changeOrigin: true,
        secure: false,
        // keep path as-is so backend receives `/api/proxy/prometheus` etc.
      },
      // Also match deeper paths explicitly
      "/api/proxy/**": {
        target: process.env.NEST_PROXY || "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
      // Forward plain `/api` to the Nest SSR server so client dev requests are proxied
      // This prevents the dev server from returning the SPA index for API calls
      "/api": {
        target: process.env.NEST_PROXY || "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
      "/api/**": {
        target: process.env.NEST_PROXY || "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
    // Ignore noisy folders that contain static diagnostic HTML/logs so Vite
    // dependency scanning doesn't try to resolve script imports inside them.
    watch: {
      ignored: ["**/logs/**", "**/tmp/**"],
    },
  },
});
