import path from 'path';
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  // Relative base so the build works from any folder or static host
  base: './',
  plugins: [react()],
  server: { port: 3000, host: '0.0.0.0' },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build:
    mode === 'artifact'
      ? // single self-contained page for sandboxed hosts: inline the logo, separate out dir
        { outDir: 'dist-artifact', assetsInlineLimit: 1_000_000 }
      : {},
  test: { environment: 'jsdom' },
}));
