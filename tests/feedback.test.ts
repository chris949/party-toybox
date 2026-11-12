// 意見・不具合を送る画面のURL（docs/spec.md の 3.1.1）
import { describe, expect, it } from 'vitest';
import { feedbackUrl } from '../src/app/feedback';

describe('意見を送る', () => {
  it('issue を作る画面を、雛形・題名・版を入れて開く', () => {
    const u = new URL(feedbackUrl('v0.25.0'));
    expect(u.origin + u.pathname).toBe('https://github.com/chris949/party-toybox/issues/new');
    expect(u.searchParams.get('template')).toBe('feedback.md');
    expect(u.searchParams.get('title')).toBe('ご意見：');
    expect(u.searchParams.get('body')).toContain('版：v0.25.0');
    expect(u.searchParams.get('body')).toContain('公開されます');
  });
});
