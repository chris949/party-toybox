// 画面の通しテスト。ビルドしたものを手元で配信し、手元の仲介サーバーでつなぐ
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: 1, // 不安定なときは1回だけやり直す
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node e2e/peer-server.mjs', port: 9000, reuseExistingServer: !process.env.CI },
    { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', port: 4173, reuseExistingServer: !process.env.CI },
  ],
});
