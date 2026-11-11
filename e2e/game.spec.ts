// 画面の通しテスト：ブラウザ2つ（ホストと参加者）で、部屋を作る → 参加 → 並べる → 予想 → 答え合わせ → 結果 → ロビーまで遊ぶ
import { expect, test, type Page } from '@playwright/test';

const Q = 'dev&peer=127.0.0.1:9000';

async function enter(page: Page, name: string, url: string) {
  await page.goto(url);
  await page.getByPlaceholder('例）たろう').fill(name);
}

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

test('運命の二者択一を2人で1ゲーム遊べる', async ({ browser }) => {
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

  // ホストがモードと制限時間を選ぶ。キャラクターは各自がロビーで選べて、相手にも見える
  await host.getByRole('button', { name: '運命の二者択一' }).click();
  await expect(guest.getByText('あなたのキャラクター')).toBeVisible();
  await guest.getByRole('button', { name: 'ねこ' }).click();
  await expect(host.locator('.pl', { hasText: 'たろう' })).toContainText('🐱');
  await host.getByRole('button', { name: '5秒', exact: true }).click();
  await host.getByRole('button', { name: 'ライフ1', exact: true }).click(); // 1回のミスで脱落
  await expect(guest.getByText('1回のミスで脱落')).toBeVisible();
  await expect(guest.getByText('5秒', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'ゲーム開始' }).click();

  // 舞台は 3D が初期値。ホストは 3D のまま、参加者は 2D に切り替えて遊ぶ（混ざっていてよい）
  await expect(guest.getByText('第1問')).toBeVisible({ timeout: 20_000 });
  await expect(host.locator('canvas.fstage3d')).toBeVisible();
  await guest.getByRole('button', { name: '2D', exact: true }).click();
  await expect(guest.locator('.piece')).toHaveCount(2); // 相手のキャラクターも見える

  // ホストは左、参加者は右へ動く。2人のゲームでは誰もお立ち台に立たず、ライフは1にしてあるので、1問で決着がつく
  await expect(host.getByText('あなたは出題者です')).toHaveCount(0);
  await host.locator('button.fans.l').click();
  await guest.locator('button.fans.r').click();
  await expect(host.locator('button.fans.l.sel')).toBeVisible();
  await expect(guest.locator('button.fans.r.sel')).toBeVisible();
  await expect(guest.getByText('が落ちた！')).toBeVisible({ timeout: 20_000 });
  await expect(guest.locator('.floor.open')).toHaveCount(1);
  await expect(host.locator('canvas.fstage3d')).toBeVisible(); // 3D が使えない端末では 2D に戻るが、ここでは 3D のまま

  // 発表のあと、自動で結果へ
  await expect(guest.getByText('最終結果')).toBeVisible({ timeout: 20_000 });
  await expect(host.getByText('の勝ち！')).toBeVisible();
  await expect(host.getByText('第1問で脱落')).toBeVisible();
  await host.getByRole('button', { name: 'ロビーに戻る' }).click();
  await expect(guest.getByText('あなたのキャラクター')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
