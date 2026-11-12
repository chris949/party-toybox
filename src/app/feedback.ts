// 意見・不具合を送る（docs/spec.md の 3.1.1）。サーバーも、GitHub に書き込む鍵も持たないので、issue を作る画面を開くだけにする
export const REPO = 'chris949/party-toybox';

// 開いた画面に入れておく本文。.github/ISSUE_TEMPLATE/feedback.md と同じ見出しに、アプリの版を足す（どの版の話か分かるように）
export function feedbackUrl(version: string): string {
  const body = [
    '<!-- 送った内容は、誰でも読めるように公開されます。名前や連絡先は書かないでください -->',
    '',
    '## どんなこと？',
    '',
    '',
    '## どのモード？',
    '',
    '',
    '---',
    `版：${version}`,
  ].join('\n');
  // template を指定すると、雛形のラベル（ご意見）が付く。本文は body で置き換える
  const q = new URLSearchParams({ template: 'feedback.md', title: 'ご意見：', body });
  return `https://github.com/${REPO}/issues/new?${q}`;
}
