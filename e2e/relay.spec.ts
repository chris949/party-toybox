// 画面の通しテスト（スタンプ伝言）：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 1ゲーム遊ぶ → 結果 → ロビーまで
import { expect, test } from '@playwright/test';
import { enter, Q } from './helpers';

test('スタンプ伝言を2人で1ゲーム遊べる', async ({ browser }) => {
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

  await host.getByRole('button', { name: 'スタンプ伝言' }).click();
  await expect(guest.getByText('絵を作る時間')).toBeVisible();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  // 1回目：2人とも、お題をスタンプで絵にする。スタンプを2つ置き、1つを大きくして、1つを消す
  const words: string[] = [];
  for (const p of [host, guest]) {
    await expect(p.locator('.status', { hasText: '1 / 2回目' })).toBeVisible({ timeout: 20_000 });
    words.push((await p.locator('.qtitle').textContent())!);
    await expect(p.getByRole('button', { name: 'この絵で出す' })).toBeDisabled();
    await p.locator('.spalette button').nth(0).click();
    await p.locator('.spalette button').nth(1).click();
    await expect(p.locator('.spad.edit span')).toHaveCount(2);
    await p.getByRole('button', { name: '大きく' }).click();
    await p.getByRole('button', { name: '消す' }).click();
    await expect(p.locator('.spad.edit span')).toHaveCount(1);
    await p.getByRole('button', { name: 'この絵で出す' }).click();
  }
  expect(words[0]).not.toBe(words[1]); // 1人に1つ、ちがうお題

  // 2回目：相手の絵（スタンプ1つ）だけが見える。お題の言葉は見えない。言葉で答える
  for (const [p, i] of [[host, 0], [guest, 1]] as const) {
    await expect(p.locator('.status', { hasText: '2 / 2回目' })).toBeVisible({ timeout: 20_000 });
    await expect(p.locator('.spad span')).toHaveCount(1);
    await expect(p.locator('.qtitle')).toHaveCount(0);
    await p.getByLabel('絵の答え').fill(`こたえ${i}`);
    await p.getByRole('button', { name: '答える' }).click();
  }

  // 発表：ホストが1つずつめくる。2枚の紙それぞれに、絵と答えが出る
  for (let book = 1; book <= 2; book++) {
    for (const p of [host, guest]) await expect(p.locator('.status', { hasText: `発表　${book} / 2枚目` })).toBeVisible({ timeout: 20_000 });
    await expect(guest.locator('.rstep')).toHaveCount(0);
    await host.getByRole('button', { name: /つぎをめくる/ }).click();
    await expect(guest.locator('.rstep .spad')).toHaveCount(1);
    await host.getByRole('button', { name: /つぎをめくる/ }).click();
    await expect(guest.locator('.rstep')).toHaveCount(2);
    await expect(guest.locator('.rtext')).toContainText('こたえ');
    await expect(guest.locator('.rhit')).toContainText('伝わりませんでした');
    await host.getByRole('button', { name: book < 2 ? '次の紙へ' : '結果発表へ' }).click();
  }

  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('絵を作る時間')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
