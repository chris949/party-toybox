// 画面の通しテスト（ティアリスト）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test, type Page } from '@playwright/test';
import { enter, Q } from './helpers';

// 画面下の選択肢を全部タップして並べ、決定する
async function arrangeAndSubmit(page: Page) {
  const chips = page.locator('.chip');
  while (await chips.count()) await chips.first().click();
  await page.getByRole('button', { name: 'この順位で決定' }).click();
}

test('2人で1ゲーム遊べる', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) p.on('pageerror', e => errors.push(e.message));

  // 部屋を作って参加する
  await enter(host, 'はなこ', `/?${Q}`);
  await host.getByRole('button', { name: '部屋を作る（ホスト）' }).click();
  const code = (await host.locator('.code').textContent({ timeout: 20_000 }))!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await enter(guest, 'たろう', `/?${Q}&room=${code}`);
  await guest.getByRole('button', { name: 'この部屋に参加する' }).click();
  await expect(host.getByText('参加者 2/10')).toBeVisible({ timeout: 20_000 });

  // 部屋に入ったまま、持っていくお題を選び直す（ホストには編集中と出る。戻ると数が変わる）
  const guestRow = host.locator('.pl', { hasText: 'たろう' });
  await expect(guestRow).toContainText('お題10');
  await guest.getByRole('button', { name: 'お題を選ぶ・編集する' }).click();
  await expect(guestRow).toContainText('編集中');
  await guest.locator('.topic input[type=checkbox]').first().uncheck();
  await guest.getByRole('button', { name: '部屋に戻る' }).click();
  await expect(guestRow).toContainText('お題9');
  await expect(guestRow).not.toContainText('編集中');

  // 準備フェーズ：ホストはドラッグで1つ置いてから残りをタップ、参加者はタップだけ
  await host.getByRole('button', { name: 'ゲーム開始' }).click();
  await expect(host.getByText('準備フェーズ')).toBeVisible();
  const firstChip = host.locator('.chip').first();
  const label = (await firstChip.textContent())!;
  // dnd-kit は「押して少し動かす」とつかむので、マウスを少しずつ動かす
  const target = host.locator('.slot').nth(2);
  await target.scrollIntoViewIfNeeded();
  const from = (await firstChip.boundingBox())!, to = (await target.boundingBox())!;
  const trayTop = (await host.locator('.tray').boundingBox())!.y;
  expect(to.y + to.height, 'ドラッグ先の枠がトレイに隠れていない').toBeLessThan(trayTop);
  await host.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await host.mouse.down();
  await host.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 3 });
  await host.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await host.mouse.up();
  await expect(target).toContainText(label);
  await arrangeAndSubmit(host);
  await arrangeAndSubmit(guest);

  // 予想 → 答え合わせを2ラウンド
  for (let round = 1; round <= 2; round++) {
    await expect(host.getByText(`ラウンド ${round} / 2`)).toBeVisible({ timeout: 20_000 });
    const guesser = await host.locator('.chip').count() ? host : guest;
    await arrangeAndSubmit(guesser);
    await expect(host.getByText('答え合わせ')).toBeVisible({ timeout: 20_000 });
    await host.getByRole('button', { name: '残りを一気にめくる' }).click();
    await expect(guest.getByText('みんなの予想')).toBeVisible({ timeout: 20_000 });
    await host.getByRole('button', { name: round < 2 ? '次のラウンドへ' : '結果発表へ' }).click();
  }

  // 結果 → ロビー
  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('出題方式')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
