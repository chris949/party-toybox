// 画面の通しテスト（ブラインドブラフ）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test } from '@playwright/test';
import { enter, Q } from './helpers';

test('ブラインドブラフを2人で1ゲーム遊べる', async ({ browser }) => {
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

  await host.getByRole('button', { name: 'ブラインドブラフ' }).click();
  await expect(guest.getByText('しゃべる時間')).toBeVisible();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  // 8ラウンド：自分のカードは「？」、相手のカードは数字で見える。ホストは勝負、参加者は1回おきに降りる
  for (let round = 1; round <= 8; round++) {
    for (const p of [host, guest]) {
      await expect(p.getByText(`ラウンド ${round} / 8`)).toBeVisible({ timeout: 20_000 });
      await expect(p.locator('.bseat.me .bcard.back')).toHaveCount(1);
      await expect(p.locator('.bseat:not(.me) .bcard:not(.back)')).toHaveCount(1);
    }
    await host.getByRole('button', { name: '勝負！' }).click();
    await guest.getByRole('button', { name: round % 2 ? '降りる' : '勝負！' }).click();
    // 発表：自分のカードも見える。点が動く
    for (const p of [host, guest]) {
      await expect(p.getByText('発表')).toBeVisible({ timeout: 20_000 });
      await expect(p.locator('.bcard.back')).toHaveCount(0);
      await expect(p.locator('.bseat.win')).toHaveCount(1);
    }
    await host.getByRole('button', { name: round < 8 ? '次のラウンドへ' : '結果発表へ' }).click();
  }

  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('しゃべる時間')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
