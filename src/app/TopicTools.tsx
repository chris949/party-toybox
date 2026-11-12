// お題の設定の「AIに頼む」「貼り付けて取り込む」「書き出す」「サンプル集」（docs/spec.md の 3.3.1）
import { useState } from 'react';
import { aiPrompt, keyOf, parseFate, parseFive, parseTier, writeFate, writeFive, writeTier, type Parsed, type TextMode } from '../core/topicText';
import { ALL_SAMPLE_TOPICS, pickCount, type Topic } from '../modes/tier/topics';
import { SAMPLE_FIVES, type FiveTopic } from '../modes/five/topics';
import { SAMPLE_FATES, type FateQuestion } from '../modes/fate/questions';
import { newTopicId } from '../storage/local';
import { Notice } from '../ui/common';
import { updateFates, updateFives, updateTopics, useStore } from './store';

type Tool = 'ai' | 'paste' | 'export' | 'samples';
type Item = Topic | FiveTopic | FateQuestion;

// モードごとの違い（読み書き・一覧の見せ方・ストックへの足し方）をまとめる
interface Adapter<T extends Item> {
  quiz: boolean;
  unit: string; // 「お題」か「問題」
  parse(text: string): Parsed<T>;
  write(list: T[]): string;
  key(t: T): string;
  label(t: T): string;
  detail(t: T): string;
  stock(): T[];
  brought(): T[];
  add(list: T[]): void;
  samples: T[];
  // ティアリストのサンプルはそのままストックに入れて使う。ほかは、足りない分をホストが自動で補うので、コピーして自分のお題を作る元にする
  copyToEdit?(t: T): void;
}

const tier: Adapter<Topic> = {
  quiz: false, unit: 'お題',
  parse: parseTier, write: writeTier, key: keyOf.tier,
  label: t => t.title, detail: t => `${t.options.length}個から${pickCount(t)}個：${t.options.join('・')}`,
  stock: () => useStore.getState().topics,
  brought: () => useStore.getState().topics.filter(t => t.bring),
  add: list => updateTopics(ts => [...ts, ...list.map(t => ({ ...t, id: newTopicId(), bring: true }))]),
  samples: ALL_SAMPLE_TOPICS.map(([title, options]) => ({ title, options, count: pickCount({ options }) })),
};
const five: Adapter<FiveTopic> = {
  quiz: true, unit: 'お題',
  parse: parseFive, write: writeFive, key: keyOf.five,
  label: t => t.title, detail: t => `○${t.answers.join('・')}　×${t.dummies.join('・')}`,
  stock: () => useStore.getState().fives,
  brought: () => useStore.getState().fives.filter(t => t.bring),
  add: list => updateFives(ts => [...ts, ...list.map(t => ({ ...t, id: newTopicId(), bring: true }))]),
  samples: SAMPLE_FIVES,
  copyToEdit: t => useStore.setState({ editingFive: { id: null, title: t.title, answers: [...t.answers], dummies: [...t.dummies], size: t.size, dummy: t.dummy }, screen: 'editFive', notice: '' }),
};
const fate: Adapter<FateQuestion> = {
  quiz: true, unit: '問題',
  parse: parseFate, write: writeFate, key: keyOf.fate,
  label: q => q.text, detail: q => `○${q.right}　×${q.wrong}`,
  stock: () => useStore.getState().fates,
  brought: () => useStore.getState().fates.filter(q => q.bring),
  add: list => updateFates(qs => [...qs, ...list.map(q => ({ ...q, id: newTopicId(), bring: true }))]),
  samples: SAMPLE_FATES,
  copyToEdit: q => useStore.setState({ editingFate: { id: null, ...q }, screen: 'editFate', notice: '' }),
};
const ADAPTERS = { tier, five, fate } as Record<TextMode, Adapter<Item>>;

// コピー。使えない環境（http のページなど）では、文字を選んで自分でコピーしてもらう
function useCopy() {
  const [done, setDone] = useState('');
  const copy = (text: string, id: string) =>
    navigator.clipboard?.writeText(text).then(() => setDone(id), () => setDone('fail')) ?? setDone('fail');
  return { done, copy };
}

export function TopicTools({ mode }: { mode: TextMode }) {
  const [tool, setTool] = useState<Tool | null>(null);
  const a = ADAPTERS[mode];
  const btn = (k: Tool, label: string) => <button className={`small ${tool === k ? 'on' : ''}`} onClick={() => setTool(tool === k ? null : k)}>{label}</button>;
  return <>
    <div className="tools">
      {btn('ai', '🤖 AIに頼む')}
      {btn('paste', '📥 取り込む')}
      {btn('export', '📤 書き出す')}
      {btn('samples', '📚 サンプル集')}
    </div>
    {tool === 'ai' && <AiPanel mode={mode} a={a} />}
    {(tool === 'ai' || tool === 'paste') && <PastePanel key={mode} a={a} />}
    {tool === 'export' && <ExportPanel a={a} />}
    {tool === 'samples' && <SamplePanel a={a} />}
  </>;
}

const COUNTS = [3, 5, 10, 20];

function AiPanel({ mode, a }: { mode: TextMode; a: Adapter<Item> }) {
  const [theme, setTheme] = useState('');
  const [n, setN] = useState(5);
  const { done, copy } = useCopy();
  const text = aiPrompt(mode, theme, n);
  return (
    <section className="card">
      <h2>AIに頼む</h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        ChatGPT・Claude・Gemini など、ふだん使っている AI に頼む文面を作ります。このアプリから AI に送ることはありません。
      </p>
      <label className="field">テーマ（なくてもよい）
        <input type="text" maxLength={40} value={theme} placeholder="例）学生時代の思い出、日本の地理" onChange={e => setTheme(e.target.value)} />
      </label>
      <div className="field muted small">作る数</div>
      <div className="seg" style={{ marginBottom: 10 }}>{COUNTS.map(c => <button key={c} className={n === c ? 'on' : ''} onClick={() => setN(c)}>{c}{a.unit === '問題' ? '問' : '個'}</button>)}</div>
      <textarea className="topic-text" readOnly value={text} onFocus={e => e.target.select()} />
      <button className="primary wide" style={{ marginTop: 8 }} onClick={() => copy(text, 'prompt')}>{done === 'prompt' ? 'コピーしました' : '文面をコピー'}</button>
      {done === 'fail' && <p className="muted small">コピーできませんでした。上の文字を長押しして、コピーしてください。</p>}
      <p className="muted small" style={{ margin: '8px 0 0' }}>AI に貼り付けて送り、返ってきた文字をコピーして、下の欄に貼り付けてください。</p>
    </section>
  );
}

function PastePanel({ a }: { a: Adapter<Item> }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState<Parsed<Item> | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState(0);
  const stockKeys = new Set(a.stock().map(a.key));
  const read = () => {
    const r = a.parse(text);
    setRes(r); setAdded(0);
    // すでにストックにあるお題と、同じ貼り付けの中で重なったお題は、初めから外しておく
    const seen = new Set(stockKeys);
    setOff(new Set(r.ok.flatMap((t, i) => { const k = a.key(t); if (seen.has(k)) return [i]; seen.add(k); return []; })));
  };
  const picked = res ? res.ok.filter((_, i) => !off.has(i)) : [];
  const add = () => {
    a.add(picked);
    setAdded(picked.length); setRes(null); setText('');
  };
  return (
    <section className="card">
      <h2>貼り付けて取り込む</h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>AI の返事や、書き出した文字を貼り付けてください。</p>
      <textarea className="topic-text" value={text} placeholder={a.quiz ? `# ${a.unit}\n○ 正解\n× ${a.unit === '問題' ? '不正解' : 'ダミー'}` : '# お題\n選択肢\n選択肢'}
        onChange={e => { setText(e.target.value); setRes(null); }} />
      <button className="wide" style={{ marginTop: 8 }} disabled={!text.trim()} onClick={read}>読み取る</button>
      {added > 0 && <Notice>{added}件を追加しました（「持っていく」にチェックが入っています）</Notice>}
      {res && <>
        {res.ok.length === 0 && <p className="muted">取り込める{a.unit}が見つかりませんでした。「#」で始まる行に{a.unit}を書いてください。</p>}
        {a.quiz && res.ok.length > 0 && <Notice>AI の答えは、間違っていることがあります。正解を確かめてから使ってね。取り込んだ{a.unit}は、あなたが作った{a.unit}として出ます。</Notice>}
        {res.ok.map((t, i) => {
          const dup = stockKeys.has(a.key(t));
          return (
            <div className="topic" key={i}>
              <label style={{ flexWrap: 'wrap' }}>
                <input type="checkbox" checked={!off.has(i)} onChange={e => setOff(s => { const x = new Set(s); if (e.target.checked) x.delete(i); else x.add(i); return x; })} />
                <b>{a.label(t)}</b>{dup && <span className="muted small">登録済み</span>}
                <span className="muted small" style={{ flexBasis: '100%', paddingLeft: 28 }}>{a.detail(t)}</span>
              </label>
            </div>
          );
        })}
        {res.bad.length > 0 && <div className="muted small" style={{ marginTop: 8 }}>
          取り込めなかったもの：{res.bad.map((b, i) => <div key={i}>・{b.title}（{b.reason}）</div>)}
        </div>}
        {res.ok.length > 0 && <button className="primary wide" style={{ marginTop: 10 }} disabled={!picked.length} onClick={add}>{picked.length}件を追加</button>}
      </>}
    </section>
  );
}

function ExportPanel({ a }: { a: Adapter<Item> }) {
  const list = a.brought();
  const text = a.write(list);
  const { done, copy } = useCopy();
  return (
    <section className="card">
      <h2>書き出す</h2>
      {list.length === 0 ? <p className="muted">「持っていく」にチェックした{a.unit}がありません。</p> : <>
        <p className="muted small" style={{ margin: '0 0 8px' }}>
          「持っていく」にチェックした{a.unit}（{list.length}件）を文字にしました。別の端末や友だちに送って、「貼り付けて取り込む」で読み込めます。
        </p>
        <textarea className="topic-text" readOnly value={text} onFocus={e => e.target.select()} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" style={{ flex: 1 }} onClick={() => copy(text, 'export')}>{done === 'export' ? 'コピーしました' : 'コピー'}</button>
          {'share' in navigator && <button style={{ flex: 1 }} onClick={() => navigator.share({ text }).catch(() => {})}>LINEなどで共有</button>}
        </div>
        {done === 'fail' && <p className="muted small">コピーできませんでした。上の文字を長押しして、コピーしてください。</p>}
      </>}
    </section>
  );
}

function SamplePanel({ a }: { a: Adapter<Item> }) {
  const stock = useStore(s => s.topics); // ティアリストの「追加済み」を、追加した直後に出し直すため
  const keys = new Set(a.copyToEdit ? [] : stock.map(t => a.key(t as Item)));
  return (
    <section className="card">
      <h2>サンプル集 <span className="muted small">{a.samples.length}件</span></h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>{a.copyToEdit
        ? `サンプルは、足りない分を自動で補うので、追加しなくても出ます。「コピーして編集」で、サンプルを元に自分の${a.unit}を作れます。`
        : '「追加」で、お題ストックに入ります。'}</p>
      {a.samples.map((t, i) => {
        const has = keys.has(a.key(t));
        return (
          <div className="topic" key={i}>
            <label style={{ flexWrap: 'wrap', cursor: 'default' }}>
              <b>{a.label(t)}</b>
              <span className="muted small" style={{ flexBasis: '100%' }}>{a.detail(t)}</span>
            </label>
            {a.copyToEdit
              ? <button onClick={() => a.copyToEdit!(t)}>コピーして編集</button>
              : <button disabled={has} onClick={() => a.add([t])}>{has ? '追加済み' : '追加'}</button>}
          </div>
        );
      })}
    </section>
  );
}
