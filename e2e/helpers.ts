// 通しテストで共通に使うもの：手元の仲介サーバーにつなぐ指定、ホームで名前を入れる操作
import type { Page } from '@playwright/test';

// ?dev は、開発者ツールから状態を見られるようにするため。peer は、CI の中に立てた仲介サーバーにつなぐ指定
export const Q = 'dev&peer=127.0.0.1:9000';

export async function enter(page: Page, name: string, url: string) {
  await page.goto(url);
  await page.getByPlaceholder('例）たろう').fill(name);
}
