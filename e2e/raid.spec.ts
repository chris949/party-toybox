// 画面の通しテスト（ダイスレイド）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 職業を選ぶ → 盤面が出る → 自分の番にサイコロを振る → 相手にも届く
import { expect, test, type Page } from '@playwright/test';
import { enter, Q } from './helpers';

// 動作確認用：部屋の画面が持っている、いまの盤面
type Dev = { __tlw: { store: { getState(): { pub: { raid: { seq: number; mySeat: number; game: { players: { classId: string }[] } } | null } } } } };
const raid = (p: Page) => p.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.raid);

test('ダイスレイドを2人で始めて、盤面で操作できる', async ({ browser }) => {
  test.setTimeout(180_000);
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

  await host.getByRole('button', { name: 'ダイスレイド' }).click();
  // 職業は、各自がロビーで選べて、相手にも見える
  await expect(guest.getByText('あなたの職業')).toBeVisible();
  await guest.locator('.raid-class', { hasText: '弓兵' }).click();
  await expect(host.locator('.raid-class', { hasText: '弓兵' }).locator('.raid-who')).toHaveText('たろう');
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  // 盤面のページが、枠の中に開く。2人に、同じ盤面が届く。席は4つで、選んだ職業になっている
  for (const p of [host, guest]) {
    await expect(p.locator('.raid-frame iframe')).toBeVisible({ timeout: 20_000 });
    await expect(p.locator('.raid-loading')).toHaveCount(0, { timeout: 60_000 });
    await expect(p.frameLocator('.raid-frame iframe').locator('#party')).toContainText('はなこ', { timeout: 20_000 });
  }
  const g = (await raid(guest))!;
  expect(g.game.players).toHaveLength(4);
  expect(g.game.players[g.mySeat].classId).toBe('archer');
  expect((await raid(host))!.mySeat).not.toBe(g.mySeat);

  // CPU の席は、ホストが進める。人の番になったら、その人の盤面に「振る」が出る。押すと、ホストを通って進み、相手にも届く
  const roll = (p: Page) => p.frameLocator('.raid-frame iframe').locator('button.roundbtn', { hasText: '振る' });
  await expect.poll(async () => (await roll(host).count()) + (await roll(guest).count()), { timeout: 90_000 }).toBeGreaterThan(0);
  const [actor, other] = (await roll(host).count()) ? [host, guest] : [guest, host];
  const before = (await raid(actor))!.seq;
  await roll(actor).click();
  await expect.poll(async () => (await raid(actor))!.seq, { timeout: 20_000 }).toBeGreaterThan(before);
  await expect.poll(async () => (await raid(other))!.seq, { timeout: 20_000 }).toBeGreaterThan(before);
  // 出目を割り当てる画面が、振った人にだけ出る
  await expect(actor.frameLocator('.raid-frame iframe').locator('#tray')).toContainText('ダイスを割り当てる', { timeout: 20_000 });
  await expect(roll(other)).toHaveCount(0);
  expect(errors).toEqual([]);
});
