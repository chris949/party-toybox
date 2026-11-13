// 画面の通しテスト（爆弾まわし）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test, type Page } from '@playwright/test';
import { enter, Q } from './helpers';

// 動作確認用：ホストの画面から、ゲームの中身（どれが正解か）を読む。参加者の画面には、選ぶまで届かない
type Dev = { __tlw: { store: { getState(): { pub: { bomb: { holderId: string; quiz: { options: string[]; mark: string[] } } } } } } };
const marks = (p: Page) => p.evaluate(() => (window as unknown as Dev).__tlw.store.getState().pub.bomb.quiz.mark.join(','));

test('爆弾まわしを2人で1ゲーム遊べる（選択式と入力式）', async ({ browser }) => {
  test.setTimeout(240_000); // 爆発を3回待つ（1回 15〜30秒）
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

  // 1ゲーム目は選択式、2ゲーム目は入力式（どちらも1ラウンド目だけ、操作を確かめる）
  for (const style of ['選択式', '入力式'] as const) {
    await host.getByRole('button', { name: style }).click();
    await host.getByRole('button', { name: 'ゲーム開始' }).click();
    for (let round = 1; round <= 3; round++) {
      for (const p of [host, guest]) await expect(p.locator('.status', { hasText: `ラウンド ${round} / 3` })).toBeVisible({ timeout: 20_000 });
      if (round === 1) {
        // 持っている人のお題と選択肢は、2人とも同じものが見える。どれが正解かは、まだ届いていない
        const hostHolds = await host.locator('.bcard-bomb.mine').isVisible();
        const [a, b] = hostHolds ? [host, guest] : [guest, host];
        await expect(b.locator('.bcard-bomb.mine')).toHaveCount(0);
        expect(await a.locator('.qtitle').textContent()).toBe(await b.locator('.qtitle').textContent());
        expect(await marks(b)).toMatch(/^,*$/);
        await expect(a.locator('.bomb-to button')).toHaveCount(0); // 当てるまでは、渡せない
        // 選択肢を1つずつ試す。はずれなら2秒待ち、当たったら渡す相手のボタンが出る（爆発の前に終わるよう、3つまで）
        const n = Math.min(3, await a.locator('.bopt').count());
        for (let i = 0; i < n && !(await a.locator('.bomb-to button').count()); i++) {
          if (style === '選択式') await a.locator('button.bopt').nth(i).click();
          else {
            await a.getByLabel('正解だと思う選択肢').fill((await a.locator('.bopt').nth(i).textContent())!.trim());
            await a.getByRole('button', { name: '答える' }).click();
          }
          await expect.poll(async () => (await marks(a)).split(',')[i], { timeout: 10_000 }).not.toBe('');
          if ((await marks(a)).split(',')[i] === 'ng') await expect(a.getByText('はずれ！')).toHaveCount(0, { timeout: 10_000 });
        }
        if (await a.locator('.bomb-to button').count()) {
          await a.locator('.bomb-to button').click();
          await expect(b.locator('.bcard-bomb.mine')).toBeVisible({ timeout: 20_000 });
          await expect(a.locator('.bomb-words span').first()).toBeVisible();
        }
      }
      // そのまま持っていると、爆発する。持っていた人のお題の、残りの正解が見える
      for (const p of [host, guest]) await expect(p.locator('.status', { hasText: '爆発！' })).toBeVisible({ timeout: 45_000 });
      await expect(guest.locator('.bomb-who')).toContainText('の手元で爆発！');
      await expect(guest.locator('.bopt.ans').first()).toBeVisible();
      await host.getByRole('button', { name: round < 3 ? '次のラウンドへ' : '結果発表へ' }).click();
    }
    await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
    await host.getByRole('button', { name: 'ロビーに戻る' }).click();
    await expect(guest.getByText('爆発の回数')).toBeVisible({ timeout: 20_000 });
  }
  expect(errors).toEqual([]);
});
