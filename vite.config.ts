import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Dev proxy to forward HiPS property requests (CORS) to the upstream IRSA host.
// This keeps the browser from being blocked during local development.
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: {
    // ensure the TypeScript parser uses our tsconfig, which enables
    // experimentalDecorators and other compilerOptions for the dependency
    // scanner.  Without this, esbuild defaults to its own tsconfig-less
    // parsing and throws on parameter decorators in Nest controllers.
    tsconfig: "./apps/frontend/tsconfig.json",
    // override format to ESM regardless of tsconfig.module so we don't
    // emit CommonJS require() calls in the browser bundle
    format: "esm",
  },
  optimizeDeps: {
    // Restrict dep-scanning to Angular source files only so Vite doesn't try
    // to resolve build artifacts (polyfills.js, main.js) referenced in
    // Playwright HTML reports under apps/frontend-e2e/logs/.
    entries: ["apps/frontend/src/**/*.{ts,html}"],
    include: [
      "@angular/core",
      "@angular/common",
      "@angular/platform-browser",
      "@angular/platform-browser/animations",
      "@angular/router",
      "@angular/animations/browser",
      "@angular/material",
      "@angular/material/snack-bar",
      "@angular/material/card",
      "@angular/material/form-field",
      "@angular/material/select",
      "@angular/material/button",
      "@angular/material/checkbox",
      "@angular/material/slide-toggle",
      "@angular/material/progress-spinner",
      "@angular/material/tooltip",
      "@angular/material/menu",
      "@angular/material/input",
      "@angular/material/icon",
      "@angular/material/dialog",
      "@angular/material/tabs",
    ],
  },
  server: {
    allowedHosts: ["host.docker.internal"],
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
      // FRONTEND_PORT is set to 4000 by start-all.sh; proxy.conf.json also targets 4000.
      "/api/proxy": {
        target:
          process.env.NEST_PROXY ||
          `http://localhost:${process.env.FRONTEND_PORT || 4000}`,
        changeOrigin: true,
        secure: false,
        // keep path as-is so backend receives `/api/proxy/prometheus` etc.
      },
      // Also match deeper paths explicitly
      "/api/proxy/**": {
        target:
          process.env.NEST_PROXY ||
          `http://localhost:${process.env.FRONTEND_PORT || 4000}`,
        changeOrigin: true,
        secure: false,
      },
      // Forward plain `/api` to the Nest SSR server so client dev requests are proxied
      // This prevents the dev server from returning the SPA index for API calls
      "/api": {
        target:
          process.env.NEST_PROXY ||
          `http://localhost:${process.env.FRONTEND_PORT || 4000}`,
        changeOrigin: true,
        secure: false,
      },
      "/api/**": {
        target:
          process.env.NEST_PROXY ||
          `http://localhost:${process.env.FRONTEND_PORT || 4000}`,
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
