// 画面の通しテスト（爆弾まわし）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test } from '@playwright/test';
import { enter, Q } from './helpers';

test('爆弾まわしを2人で1ゲーム遊べる', async ({ browser }) => {
  test.setTimeout(180_000); // 爆発を3回待つ（1回 15〜30秒）
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

  await host.getByRole('button', { name: '爆弾まわし' }).click();
  await expect(guest.getByText('爆発の回数')).toBeVisible();
  await host.getByRole('button', { name: '3回' }).click();
  await host.getByRole('button', { name: 'みじかめ' }).click();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  for (let round = 1; round <= 3; round++) {
    for (const p of [host, guest]) await expect(p.locator('.status', { hasText: `ラウンド ${round} / 3` })).toBeVisible({ timeout: 20_000 });
    // 持っている人だけに入力欄が出る。言葉を入れて渡すと、相手に回る。同じ言葉は使えない
    const hostHolds = await host.getByLabel('お題に合う言葉').isVisible();
    const [a, b] = hostHolds ? [host, guest] : [guest, host];
    await expect(b.getByLabel('お題に合う言葉')).toHaveCount(0);
    await expect(a.locator('.bomb-to button')).toBeDisabled();
    await a.getByLabel('お題に合う言葉').fill(`ことば${round}`);
    await a.locator('.bomb-to button').click();
    await expect(b.getByLabel('お題に合う言葉')).toBeVisible({ timeout: 20_000 });
    await expect(a.locator('.bomb-words span')).toHaveCount(1);
    await b.getByLabel('お題に合う言葉').fill(`ことば${round}`);
    await expect(b.getByText('その言葉は、もう出ています')).toBeVisible();
    await expect(b.locator('.bomb-to button')).toBeDisabled();
    // そのまま持っていると、爆発する。持っていなかった人に1点
    for (const p of [host, guest]) await expect(p.locator('.status', { hasText: '爆発！' })).toBeVisible({ timeout: 45_000 });
    await expect(a.locator('.bomb-who')).toContainText('の手元で爆発！');
    await host.getByRole('button', { name: round < 3 ? '次のラウンドへ' : '結果発表へ' }).click();
  }

  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('爆発の回数')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
