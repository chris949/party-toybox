/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const commit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; }
})();

export default defineConfig({
  // GitHub Pages（/party-toybox/）でも手元でも動くよう、相対パスで出力する
  base: './',
  plugins: [react()],
  // ページは2つ：本体（index.html）と、ダイスレイドの盤面（raid/index.html。部屋の画面が、枠の中に開く）
  build: { rollupOptions: { input: { main: 'index.html', raid: 'raid/index.html' } } },
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
    __COMMIT__: JSON.stringify(commit),
  },
  test: { include: ['tests/**/*.test.ts'] },
});
