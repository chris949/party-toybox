// 画面の通しテスト（運命の二者択一）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test } from '@playwright/test';
import { enter, Q } from './helpers';

test('運命の二者択一を2人で1ゲーム遊べる', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  }

  await enter(host, 'はなこ', `/?${Q}`);
  await host.getByRole('button', { name: '部屋を作る（ホスト）' }).click();
  const code = (await host.locator('.code').textContent({ timeout: 20_000 }))!.trim();
  await enter(guest, 'たろう', `/?${Q}&room=${code}`);
  await guest.getByRole('button', { name: 'この部屋に参加する' }).click();
  await expect(host.getByText('参加者 2/10')).toBeVisible({ timeout: 20_000 });

  // ホストがモードと制限時間を選ぶ。キャラクターは各自がロビーで選べて、相手にも見える
  await host.getByRole('button', { name: '運命の二者択一' }).click();
  await expect(guest.getByText('あなたのキャラクター')).toBeVisible();
  await guest.getByRole('button', { name: 'ねこ' }).click();
  await expect(host.locator('.pl', { hasText: 'たろう' })).toContainText('🐱');
  await host.getByRole('button', { name: '5秒', exact: true }).click();
  await host.getByRole('button', { name: 'ライフ1', exact: true }).click(); // 1回のミスで脱落
  await expect(guest.getByText('1回のミスで脱落')).toBeVisible();
  await expect(guest.getByText('5秒', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  // 舞台は 3D が初期値。ホストは 3D のまま、参加者は 2D に切り替えて遊ぶ（混ざっていてよい）
  await expect(guest.getByText('第1問')).toBeVisible({ timeout: 20_000 });
  await expect(host.locator('canvas.fstage3d')).toBeVisible();
  await guest.getByRole('button', { name: '2D', exact: true }).click();
  await expect(guest.locator('.piece')).toHaveCount(2); // 相手のキャラクターも見える

  // ホストは左、参加者は右へ動く。2人のゲームでは誰もお立ち台に立たず、ライフは1にしてあるので、1問で決着がつく
  await expect(host.getByText('あなたは出題者です')).toHaveCount(0);
  await host.locator('button.fans.l').click();
  await guest.locator('button.fans.r').click();
  await expect(host.locator('button.fans.l.sel')).toBeVisible();
  await expect(guest.locator('button.fans.r.sel')).toBeVisible();
  await expect(guest.getByText('が落ちた！')).toBeVisible({ timeout: 20_000 });
  await expect(guest.locator('.floor.open')).toHaveCount(1);
  await expect(host.locator('canvas.fstage3d')).toBeVisible(); // 3D が使えない端末では 2D に戻るが、ここでは 3D のまま

  // 発表のあと、自動で結果へ
  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await expect(host.getByText('の勝ち！')).toBeVisible();
  await expect(host.getByText('第1問で脱落')).toBeVisible();
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('あなたのキャラクター')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
