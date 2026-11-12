// 画面の通しテスト（ワードブーケ）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test } from '@playwright/test';
import { enter, Q } from './helpers';

test('ワードブーケを2人で1ゲーム遊べる', async ({ browser }) => {
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

  await host.getByRole('button', { name: 'ワードブーケ' }).click();
  await expect(guest.getByText('作る時間')).toBeVisible();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  // 2人なので2ラウンド（全員が親を1回）。親でない方が作り、親が選ぶ。どちらが先に親になるかは決まっていない
  for (let round = 1; round <= 2; round++) {
    for (const p of [host, guest]) await expect(p.locator('.status', { hasText: `ラウンド ${round} / 2` })).toBeVisible({ timeout: 20_000 });
    const hostMakes = await host.locator('.wpool').first().isVisible();
    const [maker, parent] = hostMakes ? [host, guest] : [guest, host];
    await expect(parent.locator('.wpool')).toHaveCount(0); // 親には手札が配られない
    // 手札は14枚。1枚と「！」を並べ、もう1枚を並べてから外す
    const cards = maker.locator('.wpool .wchip.card');
    await expect(cards).toHaveCount(14);
    await expect(maker.getByRole('button', { name: 'これで提出' })).toBeDisabled();
    await cards.nth(0).click();
    await maker.locator('.wpool .wchip.joint', { hasText: '！' }).click();
    await cards.nth(1).click();
    await expect(maker.locator('.wline .wchip')).toHaveCount(3);
    await maker.locator('.wline .wchip').nth(2).click();
    await expect(maker.locator('.wline .wchip')).toHaveCount(2);
    await maker.getByRole('button', { name: 'これで提出' }).click();
    // 親が選ぶ：作った人の名前つきで1つ並ぶ。選べるのは親だけ
    for (const p of [host, guest]) await expect(p.locator('.wentry')).toHaveCount(1, { timeout: 20_000 });
    await expect(maker.getByRole('button', { name: /ひとことを選ぶ/ })).toHaveCount(0);
    await parent.getByRole('button', { name: /ひとことを選ぶ/ }).click();
    // 発表：選ばれた人に1点
    for (const p of [host, guest]) await expect(p.locator('.wbloom')).toContainText('に1点！', { timeout: 20_000 });
    await host.getByRole('button', { name: '次へ進む' }).click();
  }

  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('作る時間')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
