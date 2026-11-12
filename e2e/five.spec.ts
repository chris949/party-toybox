// 画面の通しテスト（セレクトファイブ）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test } from '@playwright/test';
import { enter, Q } from './helpers';

test('セレクトファイブを2人で1ゲーム遊べる', async ({ browser }) => {
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

  // ホストがモードを選ぶと、参加者にも出る。お題は誰も作っていないので、同梱のサンプルで遊ぶ
  await host.getByRole('button', { name: 'セレクトファイブ' }).click();
  await expect(guest.getByText('セレクトファイブ', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  for (let round = 1; round <= 2; round++) {
    for (const p of [host, guest]) {
      await expect(p.getByText(`ラウンド ${round} / 2`)).toBeVisible({ timeout: 20_000 });
      const cards = p.locator('button.fcard');
      for (let i = 0; i < 5; i++) await cards.nth(i).click();
      await expect(cards.nth(5)).toBeDisabled(); // 6つ目は選べない
      await p.getByRole('button', { name: 'この5つで決定' }).click();
      if (round === 1 && p === host) {
        // 決定したあとも、相手がそろうまでは選び直せる（選んだ5つは残っている）
        await p.getByRole('button', { name: '選び直す' }).click();
        await expect(p.getByRole('button', { name: 'この5つで決定' })).toBeVisible();
        await cards.nth(0).click();
        await cards.nth(5).click();
        await p.getByRole('button', { name: 'この5つで決定' }).click();
        await expect(p.getByText('あなたの回答')).toBeVisible();
      }
    }
    await expect(host.getByText('答え合わせ')).toBeVisible({ timeout: 20_000 });
    await host.getByRole('button', { name: '残りを一気にめくる' }).click();
    await expect(guest.getByText('みんなの回答')).toBeVisible({ timeout: 20_000 });
    await expect(guest.locator('.fcard.dummy').first()).toBeVisible();
    await host.getByRole('button', { name: round < 2 ? '次のラウンドへ' : '結果発表へ' }).click();
  }

  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('出題方式')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
