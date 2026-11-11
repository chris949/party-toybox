// 運命の二者択一の画面：出題〜発表（同じ舞台の上で続けて見せる）と、最終結果（docs/spec.md の11章）
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { isHost, moveFate, send, type Pub } from '../../app/store';
import { Sound } from '../../audio/sound';
import { FATE_WARN_SEC } from '../../core/constants';
import { Chara, PLAYER_COLORS, variantOf, type Pose } from './charas';
import { loadFateView, saveFateView, type FateViewMode } from '../../storage/local';
import { fateRanks, type Pos, type Side } from './rules';
import type { Piece3D, StagePos } from './three/scene';

// 3Dの舞台は、3D表示を選んだ人だけが読み込む
const Stage3D = lazy(() => import('./three/Stage3D'));

// 舞台の寸法（px）。上に左右の床、下の真ん中にスタート台。床は1列3人（スマホの幅でも名前が重ならない数）、スタート台は1列5人
const ROW = 66, FLOOR_COLS = 3, PAD_COLS = 5, PAD_H = 140, GAP = 12; // 1列の高さ：キャラクター＋名前＋ライフ
// 床の高さ。ふだんは3列分。片側に10人以上集まったときだけ伸ばす
const floorHeight = (most: number) => 16 + Math.max(3, Math.ceil(most / FLOOR_COLS)) * ROW;

// 立ち位置（x は舞台の幅に対する％、y は px）
function slot(pos: StagePos, i: number, padTop: number) {
  if (pos === 'P') return { x: 50, y: 12 + i * ROW }; // お立ち台（左右の床のあいだ）
  if (pos === 'C') return { x: 4 + (i % PAD_COLS + 0.5) * (92 / PAD_COLS), y: padTop + 8 + Math.floor(i / PAD_COLS) * ROW };
  return { x: (pos === 'L' ? 0 : 56) + (i % FLOOR_COLS + 0.5) * (44 / FLOOR_COLS), y: 12 + Math.floor(i / FLOOR_COLS) * ROW };
}

// 残り時間（ミリ秒）。締め切りがない（発表中・一時停止中）ときは null
function useClock(pub: Pub, active: boolean) {
  const calc = () => pub.phase === 'question' && pub.localDeadline ? Math.max(0, pub.localDeadline - Date.now()) : null;
  const [ms, setMs] = useState(calc);
  useEffect(() => {
    setMs(calc());
    const id = setInterval(() => setMs(calc()), 100);
    return () => clearInterval(id);
  }, [pub.localDeadline, pub.phase]);
  const sec = ms == null ? null : Math.ceil(ms / 1000);
  // 残りわずか：カチカチ鳴らして、BGM を速める（生き残っている人だけ）
  const warn = active && sec != null && sec > 0 && sec <= FATE_WARN_SEC;
  useEffect(() => { if (warn) Sound.play('tick'); }, [warn, sec]);
  useEffect(() => { Sound.setHurry(warn); }, [warn]);
  useEffect(() => () => Sound.setHurry(false), []);
  return { ms, sec, warn };
}

// 位置が変わった直後だけ「移動中」のポーズにする
function useMoving(pos: StagePos) {
  const [moving, setMoving] = useState(false);
  const last = useRef(pos);
  useEffect(() => {
    if (last.current === pos) return;
    last.current = pos;
    if (pos === 'C' || pos === 'P') return; // 次の問題で真ん中に戻るとき・お立ち台に上がるときは、歩かせない
    setMoving(true);
    const id = setTimeout(() => setMoving(false), 450);
    return () => clearTimeout(id);
  }, [pos]);
  return moving;
}

type PieceProps = Piece3D & { index: number; padTop: number };

function Piece({ name, chara, color, variant, lives, pos, index, padTop, me, ghost, author, fate }: PieceProps) {
  const moving = useMoving(pos);
  const { x, y } = slot(pos, index, padTop);
  const falling = fate === 'fall';
  const pose: Pose = falling || fate === 'shock' ? 'fall' : ghost ? 'ghost' : moving ? 'move' : 'stand';
  return (
    <motion.div className={`piece ${me ? 'me' : ''} ${ghost ? 'ghost' : ''}`} initial={false}
      animate={falling
        ? { left: `${x}%`, top: y + 46, scale: 0.05, rotate: 540, opacity: 0 }
        : { left: `${x}%`, top: y, scale: 1, rotate: 0, opacity: ghost ? 0.6 : 1 }}
      // 落ちる人は、床が開いてから一拍おいて（空中でじたばたしてから）落ちる
      transition={falling ? { delay: 0.55, duration: 0.8, ease: 'easeIn' } : { type: 'spring', stiffness: 380, damping: 26 }}>
      {me && <span className="arrow">▼</span>}
      <div className={fate === 'fall' || fate === 'shock' ? 'hang' : fate === 'safe' && !ghost ? 'hop' : ghost ? 'float' : ''}>
        <Chara n={chara} pose={pose} color={color} variant={variant} />
      </div>
      {author && <span className="tag">出題</span>}
      <span className="nm">{name}</span>
      {!ghost && <span className="hp" aria-label={`ライフ${lives}`}>{'♥'.repeat(lives)}</span>}
    </motion.div>
  );
}

export function FateStage({ pub }: { pub: Pub }) {
  const f = pub.fate!, v = f.verdict;
  const iAmAuthor = f.authorIds.includes(pub.me);
  const myPos = iAmAuthor ? 'C' : f.pos[pub.me] ?? 'C'; // 自分が作った問題のあいだは、お立ち台にいる
  const iAmGhost = pub.me in f.out && !v?.fallen.includes(pub.me);
  const { ms, sec, warn } = useClock(pub, !iAmGhost);
  const [mode, setMode] = useState<FateViewMode>(loadFateView);
  const pickMode = (m: FateViewMode) => { saveFateView(m); setMode(m); };
  const canMove = pub.phase === 'question' && !f.paused && ms !== 0 && !iAmAuthor;
  const alive = pub.players.filter(p => !(p.id in f.out)).length;
  const nameOf = (id: string) => pub.players.find(p => p.id === id)?.name ?? '???';

  // ← → キーでも動ける
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft') moveFate('L');
      if (e.key === 'ArrowRight') moveFate('R');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 発表のときの床：正解は光る。不正解は開く（全員不正解で救済のときは、開いてすぐ閉じる）
  // お立ち台にいる人の画面では、出題中から正解の側が光って見える（ほかの人には見えない）
  const floorState = (side: Pos) => !v ? (f.answer === side ? 'ok' : '') : side === v.rightSide ? 'ok' : v.saved ? 'blink' : 'open';
  // 舞台に立つ全員（2D でも 3D でも同じものを描く）
  const pieces: Piece3D[] = pub.players.map((p, i) => {
    const author = f.authorIds.includes(p.id);
    const pos: StagePos = author ? 'P' : f.pos[p.id] ?? 'C'; // 作った人は、お立ち台に立つ
    const fell = !!v?.fallen.includes(p.id);
    const ghost = p.id in f.out && !fell;
    return {
      id: p.id, name: p.name, chara: p.chara, color: PLAYER_COLORS[i % PLAYER_COLORS.length], variant: variantOf(pub.players, i), lives: f.lives[p.id] ?? 0, pos,
      me: p.id === pub.me, ghost, author,
      fate: !v ? null : fell ? 'fall' : author || pos === v.rightSide ? 'safe' : ghost ? null : 'shock',
    };
  });
  const order: Record<StagePos, number> = { L: 0, R: 0, C: 0, P: 0 };
  const count = (side: Side) => pieces.filter(p => p.pos === side).length;
  const floorH = floorHeight(Math.max(count('L'), count('R'))), padTop = floorH + GAP;
  const strip = f.paused ? <div className="big">⏸ 一時停止中</div>
    : v ? <>
      <motion.div className="big" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
        ⭕ 正解は「{v.rightSide === 'L' ? f.left : f.right}」
      </motion.div>
      <motion.div className={v.fallen.length ? 'who' : ''} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        {v.saved ? '全員落ちたけど、今回は救済！'
          : v.fallen.length ? <>💥 {v.fallen.map(nameOf).join('、')} が落ちた！{v.out.length > 0 && v.out.length < v.fallen.length && <><br />☠ {v.out.map(nameOf).join('、')} は脱落</>}{v.out.length === 0 && '（ライフ −1）'}</>
          : '全員正解！'}
      </motion.div>
    </>
    : iAmGhost ? <div>👻 あなたはゴースト。動き回って、みんなを惑わせよう</div>
    : iAmAuthor ? <div><b>あなたは出題者です</b>（自動でセーフ）。正解は「{f.answer === 'L' ? f.left : f.right}」<br /><span className="muted small">正解が光って見えるのは、あなただけです</span></div>
    : myPos === 'C' ? <div><b>左右どちらかへ移動！</b>　真ん中のままだと不正解</div>
    : <div>締め切りまで、何度でも動けます</div>;

  const answer = (side: Side, text: string) => (
    <button className={`fans ${side === 'L' ? 'l' : 'r'} ${myPos === side ? 'sel' : ''} ${!v ? (f.answer === side ? 'ok' : '') : side === v.rightSide ? 'ok' : 'ng'}`}
      disabled={!canMove} aria-pressed={myPos === side} onClick={() => moveFate(side)}>
      <span className="ab">{!v ? (f.answer === side ? '⭕' : side === 'L' ? '←' : '→') : side === v.rightSide ? '⭕' : '✕'}</span><span className="txt">{text}</span>
    </button>
  );
  const floor = (side: Side) => (
    <button className={`floor ${side === 'L' ? 'l' : 'r'} ${myPos === side ? 'sel' : ''} ${floorState(side)}`} style={{ height: floorH }}
      disabled={!canMove} tabIndex={-1} aria-hidden onClick={() => moveFate(side)}>
      <span className="hole" /><span className="door a" /><span className="door b" />
    </button>
  );

  return (
    <section className="card fate">
      <div className="row" style={{ justifyContent: 'space-between', minHeight: 36 }}>
        <span><span className="status">第{f.round + 1}問</span> <span className="muted small">生き残り {alive}人</span>{!(pub.me in f.out) && <span className="hp big" aria-label={`あなたのライフ${f.lives[pub.me] ?? 0}`}> {'♥'.repeat(f.lives[pub.me] ?? 0)}</span>}</span>
        <span className="row">
          {isHost() && <button className="small" onClick={() => send({ t: 'pause' })}>{f.paused ? '▶ 再開' : '⏸ 一時停止'}</button>}
          {sec != null && <span className={`timer ${warn ? 'warn' : ''}`}>⏱ <b>{sec}</b>秒</span>}
        </span>
      </div>
      {warn && <div className="hurry-edge" aria-hidden />}
      <div className="fbar"><span style={{ width: `${ms == null ? 0 : Math.min(100, ms / (pub.fateTime * 10))}%` }} /></div>
      <div className="qtitle">{f.text}</div>
      <p className="muted small" style={{ margin: 0 }}>出題: {f.authorName}{f.authorName === 'サンプル' && f.authorIds.length > 0 && `　／　お立ち台: ${f.authorIds.map(nameOf).join('、')}`}</p>
      <div className="fstrip" aria-live="polite">{strip}</div>
      <div className="fans-row">{answer('L', f.left)}{answer('R', f.right)}</div>
      {mode === '3d' ? <Suspense fallback={<div className="fstage3d" />}>
        <Stage3D state={{ pieces, floors: { L: floorState('L'), R: floorState('R'), C: !v ? '' : v.saved ? 'blink' : 'open' }, mySide: myPos }} onFail={() => pickMode('2d')} />
      </Suspense>
      : <div className={`fstage ${v?.fallen.length ? 'quake' : ''}`} style={{ height: padTop + PAD_H }}>
        {floor('L')}{floor('R')}
        <div className="podium" style={{ height: floorH }}><span className="lbl">お立ち台</span></div>
        <div className={`pad ${v ? (v.saved ? 'blink' : 'open') : ''}`} style={{ top: padTop, height: PAD_H }}>
          <span className="hole" /><span className="door a" /><span className="door b" /><span className="lbl">スタート</span>
        </div>
        {pieces.map(p => <Piece key={p.id} {...p} index={order[p.pos]++} padTop={padTop} />)}
      </div>}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span className="muted small">答えか床をタップして移動（キーボードは ← →）</span>
        <span className="seg mini-seg">{(['2d', '3d'] as const).map(m => (
          <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => pickMode(m)}>{m.toUpperCase()}</button>
        ))}</span>
      </div>
    </section>
  );
}

export function FateResult({ pub }: { pub: Pub }) {
  const f = pub.fate!;
  const ranks = fateRanks(pub.players.map(p => p.id), f.out);
  const colorOf = (id: string) => PLAYER_COLORS[pub.players.findIndex(p => p.id === id) % PLAYER_COLORS.length];
  const sorted = [...pub.players].sort((a, b) => ranks[a.id] - ranks[b.id]);
  const winners = sorted.filter(p => ranks[p.id] === 1);
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <section className="card">
      <h2>最終結果</h2>
      <div className="fwin">
        <div className="row" style={{ justifyContent: 'center' }}>{winners.map(p => <div className="hop" key={p.id}><Chara n={p.chara} size={72} color={colorOf(p.id)} variant={variantOf(pub.players, pub.players.indexOf(p))} /></div>)}</div>
        <div className="big">🏆 {winners.length === 1 ? `${winners[0].name} の勝ち！` : `生き残った${winners.length}人の勝ち！`}</div>
        <div className="muted small">{winners.length === 1 ? '最後の1人まで生き残りました' : '問題がなくなるまで生き残りました'}</div>
      </div>
      {sorted.map(p => (
        <div className={`rank-row ${ranks[p.id] === 1 ? 'first' : ''}`} key={p.id}>
          <span className="n">{medal[ranks[p.id] - 1] ?? ranks[p.id]}</span>
          <Chara n={p.chara} size={36} color={colorOf(p.id)} variant={variantOf(pub.players, pub.players.indexOf(p))} pose={ranks[p.id] === 1 ? 'stand' : 'ghost'} />
          <span className="nm">{p.name}{p.id === pub.me ? '（あなた）' : ''}</span>
          <span className="small muted">{p.id in f.out ? `第${f.out[p.id] + 1}問で脱落` : `生き残り ${'♥'.repeat(f.lives[p.id] ?? 0)}`}</span>
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        {isHost() ? <button className="primary wide" onClick={() => send({ t: 'lobby' })}>ロビーに戻る</button> : <p className="muted">ホストがロビーに戻すのを待っています…</p>}
      </div>
    </section>
  );
}
