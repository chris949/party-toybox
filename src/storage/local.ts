// 端末に保存するもの。キー名は v0.8 と同じにして、今までのお題・名前・音の設定をそのまま読めるようにする
import { pickCount, SAMPLE_TOPICS, type Topic } from '../modes/tier/topics';
import { sanitizeFives, type FiveTopic } from '../modes/five/topics';
import { sanitizeFates, type FateQuestion } from '../modes/fate/questions';
import { toTheme } from '../modes/haiku/themes';
import { sanitizeBouquets, sanitizeBouquetWords } from '../modes/bouquet/words';

const uid = () => Math.random().toString(36).slice(2, 10);

const local = {
  get<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できない環境でも遊べるようにする */ } },
};
const session = {
  get(k: string, make: () => string) {
    try { const v = sessionStorage.getItem(k) || make(); sessionStorage.setItem(k, v); return v; } catch { return make(); }
  },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* 同上 */ } },
};

// 端末に保存しているお題（id と「持っていく」を含む）
export interface StoredTopic extends Topic { id: string; bring: boolean }

export function loadTopics(): StoredTopic[] {
  const saved = local.get<Partial<StoredTopic>[] | null>('tlw-topics', null);
  if (!saved) return SAMPLE_TOPICS.map(([title, options]) => ({ id: uid(), title, options, count: options.length, bring: true }));
  // v0.5 以前のお題には出題数がない
  return saved.filter(t => t && t.title && Array.isArray(t.options)).map(t => ({
    id: t.id ?? uid(), title: t.title!, options: t.options!, count: pickCount(t as Topic), bring: t.bring !== false,
  }));
}
export const saveTopics = (topics: StoredTopic[]) => local.set('tlw-topics', topics);
export const broughtTopics = (topics: StoredTopic[]): Topic[] =>
  topics.filter(t => t.bring).map(t => ({ title: t.title, options: t.options, count: pickCount(t) }));
export const newTopicId = uid;

// セレクトファイブのお題（最初は空。同梱のサンプルはホストが補うので、端末には入れない）
export interface StoredFive extends FiveTopic { id: string; bring: boolean }
export function loadFives(): StoredFive[] {
  const saved = local.get<Partial<StoredFive>[]>('tlw-fives', []);
  return (Array.isArray(saved) ? saved : []).flatMap(t => {
    const [ok] = sanitizeFives([t]);
    return ok ? [{ ...ok, id: t.id ?? uid(), bring: t.bring !== false }] : [];
  });
}
export const saveFives = (fives: StoredFive[]) => local.set('tlw-fives', fives);
export const broughtFives = (fives: StoredFive[]): FiveTopic[] =>
  fives.filter(t => t.bring).map(({ title, answers, dummies, size, dummy }) => ({ title, answers, dummies, size, dummy }));

// 運命の二者択一の問題（最初は空。同梱のサンプルはホストが補うので、端末には入れない）
export interface StoredFate extends FateQuestion { id: string; bring: boolean }
export function loadFates(): StoredFate[] {
  const saved = local.get<Partial<StoredFate>[]>('tlw-fates', []);
  return (Array.isArray(saved) ? saved : []).flatMap(q => {
    const [ok] = sanitizeFates([q]);
    return ok ? [{ ...ok, id: q.id ?? uid(), bring: q.bring !== false }] : [];
  });
}
export const saveFates = (fates: StoredFate[]) => local.set('tlw-fates', fates);
export const broughtFates = (fates: StoredFate[]): FateQuestion[] =>
  fates.filter(q => q.bring).map(({ text, right, wrong }) => ({ text, right, wrong }));

// ハイカー575 のお題（上の五文字。最初は空。同梱のサンプルはホストが補う）
export interface StoredHaiku { id: string; text: string; bring: boolean }
export function loadHaikus(): StoredHaiku[] {
  const saved = local.get<Partial<StoredHaiku>[]>('tlw-haikus', []);
  return (Array.isArray(saved) ? saved : []).flatMap(h => {
    const text = toTheme(h?.text);
    return text ? [{ id: h.id ?? uid(), text, bring: h.bring !== false }] : [];
  });
}
export const saveHaikus = (haikus: StoredHaiku[]) => local.set('tlw-haikus', haikus);
export const broughtHaikus = (haikus: StoredHaiku[]): string[] => haikus.filter(h => h.bring).map(h => h.text);

// ワードブーケのお題（最初は空。同梱のサンプルはホストが補う）
export interface StoredBouquet { id: string; text: string; bring: boolean }
export function loadBouquets(): StoredBouquet[] {
  const saved = local.get<Partial<StoredBouquet>[]>('tlw-bouquets', []);
  return (Array.isArray(saved) ? saved : []).flatMap(b => {
    const [text] = sanitizeBouquets([b?.text]);
    return text ? [{ id: b.id ?? uid(), text, bring: b.bring !== false }] : [];
  });
}
export const saveBouquets = (list: StoredBouquet[]) => local.set('tlw-bouquets', list);
export const broughtBouquets = (list: StoredBouquet[]): string[] => list.filter(b => b.bring).map(b => b.text);

// ワードブーケの、持ち寄りの言葉（入れたものは、すべて持っていく）
export const loadBouquetWords = (): string[] => sanitizeBouquetWords(local.get<unknown>('tlw-bouquet-words', []));
export const saveBouquetWords = (words: string[]) => local.set('tlw-bouquet-words', words);

// タイトル画面を最後に見た日（その日のうちは、もう出さない）
export const loadTitleDay = (): string => String(local.get<unknown>('tlw-title-day', '') ?? '');
export const markTitleDay = (day: string) => local.set('tlw-title-day', day);

// その端末で遊んだことのあるモード（あそびかたに「はじめて」の印を出すため）
export const loadPlayed = (): string[] => { const v = local.get<unknown>('tlw-played', []); return Array.isArray(v) ? v.map(String) : []; };
export const markPlayed = (mode: string) => { const v = loadPlayed(); if (!v.includes(mode)) local.set('tlw-played', [...v, mode]); };

// 運命の二者択一で使うキャラクターの番号
export const loadChara = () => Math.max(0, Math.trunc(Number(local.get('tlw-chara', 0))) || 0);
export const saveChara = (n: number) => local.set('tlw-chara', n);

// 運命の二者択一の舞台の見せ方（2D／3D）
export type FateViewMode = '2d' | '3d';
export const loadFateView = (): FateViewMode => local.get<string>('tlw-fate-view', '3d') === '2d' ? '2d' : '3d';
export const saveFateView = (m: FateViewMode) => local.set('tlw-fate-view', m);

export const loadName = () => local.get('tlw-name', '');
export const saveName = (name: string) => local.set('tlw-name', name);

export type SoundMode = 'all' | 'se' | 'off';
export const loadSoundMode = (): SoundMode => local.get<SoundMode>('tlw-sound', 'all');
export const saveSoundMode = (m: SoundMode) => local.set('tlw-sound', m);

export interface Volumes { bgm: number; se: number } // 0〜1
export const loadVolumes = (): Volumes => ({ bgm: 0.3, se: 0.7, ...local.get<Partial<Volumes>>('tlw-volume', {}) });
export const saveVolumes = (v: Volumes) => local.set('tlw-volume', v);

// タブごとに別プレイヤーとして扱う（リロードしても同じ人として復帰できる）。
// myId は他の参加者にも見えるので、なりすまし防止に本人だけが知る myKey を併せて送る
export const myId = session.get('tlw-id', () => uid() + uid());
export const myKey = session.get('tlw-key', () => uid() + uid() + uid());
export const loadLastRoom = () => session.get('tlw-room', () => '');
export const saveLastRoom = (code: string) => session.set('tlw-room', code);
