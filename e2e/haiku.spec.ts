// 画面の通しテスト（ハイカー575）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test } from '@playwright/test';
import { enter, Q } from './helpers';

test('ハイカー575を2人で1ゲーム遊べる', async ({ browser }) => {
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

  // ホストがモードを選ぶ。お題は誰も作っていないので、同梱のサンプルの上五で遊ぶ（残りの12文字を書く）
  await host.getByRole('button', { name: 'ハイカー575' }).click();
  await expect(guest.getByText('ハイカー575', { exact: true })).toBeVisible();
  await expect(guest.getByText('お題持ち寄り', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  // 2人とも1文字ずつ書くと、短冊が回って次の文字へ。カタカナで打っても、ひらがなになる
  for (let step = 1; step <= 12; step++) {
    for (const p of [host, guest]) {
      await expect(p.getByText(`${step}文字目 / 12`)).toBeVisible({ timeout: 20_000 });
      await expect(p.locator('.tanzaku .cell.on')).toHaveCount(5 + step - 1); // それまでの文字が全部見える
      await p.getByLabel('続きの1文字（ひらがな）').fill(step === 1 ? 'ネ' : 'こ');
      await p.getByRole('button', { name: step === 1 ? '「ね」で決定' : '「こ」で決定' }).click();
    }
  }

  // 発表：1作品ずつ。担当者以外が★を付けると、点が出る
  for (let n = 1; n <= 2; n++) {
    await expect(guest.getByText(`作品 ${n} / 2`)).toBeVisible({ timeout: 20_000 });
    await host.getByRole('button', { name: '一気に出す' }).click();
    for (const p of [host, guest]) {
      await expect(p.getByText('読み上げてください')).toBeVisible({ timeout: 20_000 });
      await expect(p.locator('.tanzaku .cell.on')).toHaveCount(17);
    }
    const rater = await host.locator('.star-pick').isVisible() ? host : guest;
    await rater.getByRole('radio', { name: '★5' }).click();
    await expect(guest.getByText('この作品の点')).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByText('50点', { exact: true })).toBeVisible();
    await host.getByRole('button', { name: n < 2 ? '次の作品へ' : '結果発表へ' }).click();
  }

  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText('できた作品')).toBeVisible();
  await expect(guest.locator('.work')).toHaveCount(2);
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('遊び方', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
