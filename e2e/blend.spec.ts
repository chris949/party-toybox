// 画面の通しテスト（まぎれろ！）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test } from '@playwright/test';
import { enter, Q } from './helpers';

test('まぎれろ！を2人で1ゲーム遊べる', async ({ browser }) => {
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

  await host.getByRole('button', { name: 'まぎれろ！' }).click();
  await expect(guest.getByText('かくれる時間')).toBeVisible();
  await host.getByRole('button', { name: '8体' }).click();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  // 2人なので2ラウンド（全員が1回ずつかくれる）。どちらが先にかくれるかは決まっていない
  type Dev = { __tlw: { store: { getState(): { pub: { blend: { me: number | null; pos: number[]; tick: number; ready: boolean } } } } } };
  for (let round = 1; round <= 2; round++) {
    for (const p of [host, guest]) {
      await expect(p.locator('.status', { hasText: `ラウンド ${round} / 2` })).toBeVisible({ timeout: 20_000 });
      await expect(p.locator('canvas.mstage3d')).toBeVisible();
    }
    const hostHides = await host.locator('.mgrab').isVisible();
    const [hider, seeker] = hostHides ? [host, guest] : [guest, host];
    await expect(seeker.locator('.mgrab')).toHaveCount(0);
    // どれが人かは、かくれている本人にだけ届く。位置は8体ぶん届き、動き出したあとは進み続ける
    expect(await hider.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.blend.me)).not.toBeNull();
    expect(await seeker.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.blend.me)).toBeNull();
    expect(await seeker.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.blend.pos.length)).toBe(16);
    await expect.poll(() => seeker.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.blend.ready), { timeout: 20_000 }).toBe(false);
    const tick = await seeker.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.blend.tick);
    await expect.poll(() => seeker.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.blend.tick), { timeout: 20_000 }).toBeGreaterThan(tick + 3);
    // ホストが、時間を待たずに発表する
    await host.getByRole('button', { name: '時間を待たずに発表する' }).click();
    for (const p of [host, guest]) {
      await expect(p.locator('.status', { hasText: '発表' })).toBeVisible({ timeout: 20_000 });
      await expect(p.locator('.mguess span')).toHaveCount(1);
    }
    expect(await seeker.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.blend.me)).not.toBeNull();
    await host.getByRole('button', { name: round < 2 ? '次のラウンドへ' : '結果発表へ' }).click();
  }

  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('かくれる時間')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
