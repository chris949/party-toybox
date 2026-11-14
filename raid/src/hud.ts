import {
  BOARD, CARD_MAP, CARD_PRICE, CHIP_MAP, CHIP_SELL_COINS, CLASSES, ENEMIES, GIFT_COINS, LEVEL_MAX, SUPPLY_EVERY, TAGS, TILE_INFO,
  calcAtk, calcDef, calcEvd, calcMoveBonus, contributionScore, distTo, enemyTiles, focusMax, getActorId, isMelee, levelCost,
  previewDamage, rarityOdds, tagCounts, targetsInRange, walkDestinations,
} from '../../src/modes/raid/engine';
import type { Action, AttackTarget, GameState, Player, Tag } from '../../src/modes/raid/engine';
import type { Overlay } from './overlay';
import type { BoardScene } from './scene';
import { PLAYER_COLORS } from './scene';
import { sound } from './sound';
import { ASSETS } from './assets';
import { music } from './music';

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const RARITY = { 1: 'ブロンズ', 2: 'シルバー', 3: 'ゴールド' } as const;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const bust = (p: Player) => `chars/${p.classId}_bust.png`;

/** カードの絵の代わり（専用の絵ができたら差し替え） */
const CARD_ICON: Record<string, string> = {
  dash: '💨', reroll: '🔄', fix: '🎯', power: '💪', potion: '🧪', bell: '🔔', ward: '🛡', coin_bag: '💰',
};

export interface HudCallbacks {
  dispatch(action: Action): void;
  restart(): void;
  setSpeed(n: number): void;
}

type Btn = (label: string, fn: () => void, opts?: { cls?: string; disabled?: boolean; title?: string }) => string;

/**
 * 画面上のHTML部分。
 *   上：ラウンドの進行バーとボス / 左：パーティー一覧 / 左下：自分のキャラ
 *   下中央：手札 / 中央：いまの手番の選択肢（トレイ） / 右下：大きな丸ボタン
 */
export class Hud {
  private pendingCard: number | null = null;
  private pendingChip: number | null = null;
  private revealedDraft = '';
  private levelMenu = false;
  /** 1台で交代して遊ぶとき、最後に操作した人を左下に表示し続ける */
  private viewer: number;
  speed = 1;

  private tip: HTMLElement;
  private last: GameState | null = null;
  private handlers: [string, () => void][] = [];

  constructor(private scene: BoardScene, private overlay: Overlay, private humans: Set<number>, private cb: HudCallbacks) {
    this.viewer = [...humans][0] ?? 0;
    this.tip = document.createElement('div');
    this.tip.id = 'tip';
    document.body.appendChild(this.tip);
    scene.onHover = (tile, x, y) => this.showTip(tile, x, y);
    $('logtoggle').onclick = () => $('log').classList.toggle('open');
  }

  private isHuman(pid: number) {
    return this.humans.has(pid);
  }

  /** マスにマウスを乗せると、そのマスの効果といる敵を表示 */
  private showTip(tile: number | null, x: number, y: number) {
    if (tile === null || !this.last) {
      this.tip.style.display = 'none';
      return;
    }
    const t = BOARD.tiles[tile];
    const info = TILE_INFO[t.type];
    const s = this.last;
    const foes = s.enemies.filter((e) => e.tile === tile).map((e) => `${ENEMIES[e.kind].icon}${ENEMIES[e.kind].name} HP${e.hp} 攻${e.atk}`);
    const danger = s.boss?.intent?.tiles.includes(tile) ? `<br><span class="bad">⚠ ボスの攻撃範囲（${s.boss.intent.base}+🎲）</span>` : '';
    const zone = { outer: '外周', inner: '内周：ボスを殴れるが威圧を受ける', spoke: '連絡路' }[t.zone];
    this.tip.innerHTML = `<b>${info.icon} ${info.name}</b><br>${info.desc}<br><span class="small">${zone}</span>${foes.length ? `<br>${foes.join('<br>')}` : ''}${danger}`;
    this.tip.style.display = 'block';
    this.tip.style.left = `${Math.min(x + 14, window.innerWidth - 250)}px`;
    this.tip.style.top = `${y + 14}px`;
  }

  render(s: GameState, busy: boolean) {
    this.last = s;
    const actor = getActorId(s);
    if (actor !== null && this.isHuman(actor)) this.viewer = actor;
    this.handlers = [];
    this.renderTop(s);
    this.renderParty(s);
    this.renderMe(s);
    this.renderLog(s);
    this.renderControls(s, busy);
    this.renderModal(s, busy);
  }

  private btn: Btn = (label, fn, opts = {}) => {
    const id = `b${this.handlers.length}`;
    this.handlers.push([id, fn]);
    return `<button id="${id}" class="${opts.cls ?? ''}" ${opts.disabled ? 'disabled' : ''} title="${esc(opts.title ?? '')}">${label}</button>`;
  };

  private bind() {
    for (const [id, fn] of this.handlers) {
      const el = document.getElementById(id);
      if (el) el.onclick = () => { sound.play('click'); fn(); };
    }
  }

  // ───────────────────────── 上：進行バー・ボス ─────────────────────────

  private renderTop(s: GameState) {
    const cells = Array.from({ length: s.config.maxRounds }, (_, i) => {
      const r = i + 1;
      const mark = r === s.config.bossRound ? '🐉' : r % SUPPLY_EVERY === 0 ? '📦' : '';
      const cls = r < s.round ? 'past' : r === s.round ? 'now' : '';
      const title = r === s.config.bossRound ? 'ボス出現' : r % SUPPLY_EVERY === 0 ? 'ラウンド終了時にチップの定期配給' : '';
      return `<span class="rc ${cls} ${r >= s.config.bossRound ? 'boss' : ''}" title="${title}"><i>${r}</i>${mark ? `<em>${mark}</em>` : ''}</span>`;
    }).join('');
    const boss = s.boss
      ? `<div class="bossbar"><b>🐉 ${esc(s.boss.name)}</b>
          <div class="bar boss"><i style="width:${(Math.max(0, s.boss.hp) / s.boss.maxHp) * 100}%"></i><span>${Math.max(0, s.boss.hp)} / ${s.boss.maxHp}${s.boss.enraged ? ' 😡' : ''}${s.boss.charged ? ' ⚡溜め' : ''}</span></div>
          ${s.boss.intent ? `<div class="intent">予告：${esc(s.boss.intent.label)}${s.boss.intent.base ? `（攻撃力 ${s.boss.intent.base}+🎲）` : ''}</div>` : ''}</div>`
      : `<div class="bossbar sleeping">💤 ボス出現まであと <b>${s.config.bossRound - s.round}</b> ラウンド</div>`;
    $('topbar').innerHTML = `
      <div class="track">${cells}</div>
      ${boss}`;
    $('sys').innerHTML = `
      <span class="chip" title="KOされるたびに1減る。0で敗北">${'❤️'.repeat(Math.max(0, s.teamLife))}${'🖤'.repeat(Math.max(0, s.config.teamLife - s.teamLife))}</span>
      <span class="chip" title="チームで共有するダイス。自分の出目1個と交換できる（チームで1ラウンド1回）">チーム🎲${s.teamDie}${s.teamDieUsed ? '✓' : ''}</span>
      <button id="speed" title="演出の速さ">⏩x${this.speed}</button>
      <button id="recenter" title="現在地に戻る（盤面はドラッグで動かせます。ホイールで拡大縮小）">📍</button>
      <button id="view" title="カメラ：キャラを追いかける／盤面全体">${this.scene.viewMode === 'follow' ? '🎯' : '🗺'}</button>
      <button id="mute" title="音のオン・オフ">${sound.muted ? '🔇' : '🔊'}</button>`;
    $('recenter').onclick = () => this.scene.resetView();
    $('view').onclick = () => {
      this.scene.viewMode = this.scene.viewMode === 'follow' ? 'overview' : 'follow';
      try { localStorage.setItem('dr-view', this.scene.viewMode); } catch { /* 保存できなくても動作に影響なし */ }
      this.renderTop(s);
    };
    $('speed').onclick = () => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
      this.cb.setSpeed(this.speed);
      this.renderTop(s);
    };
    $('mute').onclick = () => {
      sound.setMuted(!sound.muted);
      music.refresh();
      this.renderTop(s);
    };
  }

  // ───────────────────────── 左：パーティー一覧 ─────────────────────────

  private renderParty(s: GameState) {
    $('party').innerHTML = s.players.map((p) => {
      const active = s.players[s.current].id === p.id && !s.result;
      const chips = p.chips.map((id) => {
        const c = CHIP_MAP[id];
        return `<i class="dot rar-${c.tier}" title="${esc(`${c.name}（${RARITY[c.tier]}）：${c.desc}`)}">${TAGS[c.tag].icon}</i>`;
      }).join('');
      return `<div class="prow ${active ? 'active' : ''}" style="--pc:${hex(PLAYER_COLORS[p.id])}">
        <img class="pface" src="${bust(p)}" alt="">
        <div class="pinfo">
          <div class="pname">${esc(p.name)} <span class="small">Lv${p.level}${p.isCpu ? '・CPU' : ''}</span></div>
          <div class="bar"><i style="width:${(p.hp / p.maxHp) * 100}%"></i><span>${p.hp}/${p.maxHp}</span></div>
          <div class="pstats"><span>🪙${p.coins}</span><span title="集中トークン">🎯${p.focus}</span><span>🃏${p.hand.length}</span><span title="貢献度">⭐${contributionScore(p)}</span></div>
          <div class="pchips">${chips}</div>
        </div>
      </div>`;
    }).join('');
  }

  // ───────────────────────── 左下：自分のキャラ ─────────────────────────

  private renderMe(s: GameState) {
    const p = s.players[this.viewer];
    const cls = CLASSES[p.classId];
    const sets = (Object.entries(tagCounts(p)) as [Tag, number][])
      .filter(([, n]) => n >= 2)
      .map(([t, n]) => `<span class="set" title="${esc(n >= 4 ? TAGS[t].set4 : TAGS[t].set2)}">${TAGS[t].icon}${n >= 4 ? 4 : 2}</span>`).join('');
    const chips = p.chips.map((id) => {
      const c = CHIP_MAP[id];
      return `<span class="chipicon rar-${c.tier}" title="${esc(`${c.name}（${TAGS[c.tag].name}・${RARITY[c.tier]}）：${c.desc}`)}">${TAGS[c.tag].icon}${esc(c.name)}</span>`;
    }).join('') + '<span class="chipicon empty">＋</span>'.repeat(Math.max(0, p.chipSlots - p.chips.length));
    $('me').innerHTML = `
      <div class="me-face" style="--pc:${hex(PLAYER_COLORS[p.id])}"><img src="${bust(p)}" alt=""><span class="me-lv">Lv${p.level}</span></div>
      <div class="me-body">
        <div class="me-name">${cls.icon} ${esc(p.name)} <span class="small">${cls.name}</span></div>
        <div class="bar big"><i style="width:${(p.hp / p.maxHp) * 100}%"></i><span>HP ${p.hp} / ${p.maxHp}</span></div>
        <div class="me-stats">
          <span title="攻撃">⚔️${calcAtk(p)}</span><span title="防御">🛡${calcDef(p)}</span><span title="回避">💨${calcEvd(p)}</span>
          <span title="射程">🎯射程${cls.range}</span><span title="集中トークン">集中${p.focus}/${focusMax(p)}</span><span>🪙${p.coins}</span>${sets}
        </div>
        <div class="chips">${chips}</div>
        ${this.levelHtml(s, p)}
      </div>`;
    const lv = document.getElementById('lvup');
    if (lv) lv.onclick = () => { sound.play('click'); this.levelMenu = true; this.render(s, false); };
  }

  /** レベルアップのゲージとボタン（自分のターン中ならどこでも押せる） */
  private levelHtml(s: GameState, p: Player): string {
    if (p.level >= LEVEL_MAX) return '<div class="lvrow"><span class="small">最大レベル</span></div>';
    const cost = levelCost(p);
    const ready = p.coins >= cost;
    const actor = getActorId(s);
    const canNow = ready && actor === p.id && s.players[s.current].id === p.id && ['roll', 'act', 'shop'].includes(s.step) && !s.drafts.length;
    return `<div class="lvrow"><div class="bar lv"><i style="width:${Math.min(100, (p.coins / cost) * 100)}%"></i><span>🪙${p.coins} / ${cost}</span></div>
      <button id="lvup" class="${canNow ? 'primary glow' : ''}" ${canNow ? '' : 'disabled'} title="コインでレベルアップ（自分のターン中ならいつでも）">⬆ Lv${p.level + 1}へ</button></div>`;
  }

  private renderLog(s: GameState) {
    const el = $('log');
    el.innerHTML = s.log.slice(-40).map((l) => `<p>${esc(l)}</p>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  // ───────────────────────── 操作（トレイ・手札・丸ボタン） ─────────────────────────

  private renderControls(s: GameState, busy: boolean) {
    const tray = $('tray');
    const hand = $('hand');
    const actions = $('actions');
    this.scene.setHighlights([], null);
    this.scene.setRoutes(null, []);
    this.scene.setBranchArrows(null, [], null);
    const actor = getActorId(s);
    const humanTurn = actor !== null && this.isHuman(actor) && !busy && !s.result;
    if (!(s.step === 'react' && humanTurn && !s.drafts.length)) this.overlay.hideReact();

    // 手札はいつも自分（左下のキャラ）のものを表示
    const me = s.players[this.viewer];
    const myTurn = humanTurn && actor === this.viewer && !s.drafts.length;
    hand.innerHTML = this.handHtml(s, me, myTurn);

    if (s.result) {
      tray.innerHTML = `<div class="tray-title">${s.result === 'win' ? '🎉 勝利！' : '💀 敗北…'}</div>`;
      actions.innerHTML = '';
      this.bind();
      return;
    }
    if (actor === null || busy || !humanTurn) {
      const p = actor !== null ? s.players[actor] : null;
      tray.innerHTML = busy || !p
        ? ''
        : `<div class="tray-title waiting">${CLASSES[p.classId].icon} ${esc(p.name)} が考え中…</div><div class="small">ボスの予告を見ながら、次の自分のターンの位置取りを考えよう</div>`;
      tray.classList.toggle('empty', busy || !p);
      actions.innerHTML = '';
      this.bind();
      return;
    }
    tray.classList.remove('empty');
    const p = s.players[actor];
    if (s.drafts.length) {
      tray.innerHTML = '<div class="tray-title">チップを選んでください</div>';
      actions.innerHTML = '';
      this.bind();
      return;
    }
    const act = (a: Action) => this.cb.dispatch(a);
    if (s.step === 'react') {
      tray.innerHTML = '<div class="tray-title">⚔️ 攻撃を受けている！</div>';
      actions.innerHTML = '';
      this.overlay.renderReact(s, s.queue[0], (choice) => act({ type: 'react', playerId: p.id, choice }));
      this.bind();
      return;
    }
    const pid = p.id;
    const btn = this.btn;
    let html = '';
    let main = '';
    let skill = '';

    // レベルアップの選択（左下のボタンから開く）
    if (this.levelMenu && ['roll', 'act', 'shop'].includes(s.step) && p.coins >= levelCost(p) && p.level < LEVEL_MAX) {
      const odds = rarityOdds(s, { ...p, level: p.level + 1 });
      html += `<div class="tray-title">⬆ レベルアップ（🪙${levelCost(p)}）：Lv${p.level} → Lv${p.level + 1}</div>
        <div class="small">HP回復・<b>チップ枠+1</b>・レアチップが出やすくなる（ゴールド${Math.round(odds[2] * 100)}%）。さらに1つ選んで強化：</div><div class="actions">`;
      html += btn('💪 ステータス強化<br><span class="small">攻+1 防+1 最大HP+4</span>', () => { this.levelMenu = false; act({ type: 'levelUp', playerId: pid, choice: 'stats' }); }, { cls: 'primary' });
      html += btn(`✨ スキル強化<br><span class="small">${esc(CLASSES[p.classId].skillName)} Lv${p.skillLevel + 1}・すぐ使える</span>`, () => { this.levelMenu = false; act({ type: 'levelUp', playerId: pid, choice: 'skill' }); }, { cls: 'primary' });
      html += btn('やめる', () => { this.levelMenu = false; this.render(s, false); });
      html += '</div>';
      tray.innerHTML = html;
      actions.innerHTML = '';
      this.bind();
      return;
    }
    this.levelMenu = false;

    // 味方を対象にするカードの対象選択
    if (this.pendingCard !== null) {
      const card = CARD_MAP[p.hand[this.pendingCard]];
      html += `<div class="tray-title">「${esc(card.name)}」を誰に使う？</div><div class="actions">`;
      for (const m of s.players) {
        html += btn(`<img class="mini" src="${bust(m)}" alt=""> ${esc(m.name)}（HP ${m.hp}/${m.maxHp}）`, () => {
          const index = this.pendingCard!;
          this.pendingCard = null;
          act({ type: 'useCard', playerId: pid, index, targetId: m.id });
        });
      }
      html += btn('やめる', () => { this.pendingCard = null; this.render(s, false); });
      html += '</div>';
      tray.innerHTML = html;
      actions.innerHTML = '';
      this.bind();
      return;
    }

    switch (s.step) {
      case 'roll':
        html += `<div class="tray-title">${esc(p.name)}のターン</div>
          <div class="small">ダイスを2個振り、「移動」と「行動（攻撃の威力）」に1個ずつ割り当てます。出目1〜2で集中🎯が貯まります。</div>
          ${p.cursed ? '<div class="bad small">💀 呪われている：ダイス1個が「1」になる</div>' : ''}`;
        main = btn('<span class="rb-icon">🎲</span><span class="rb-label">振る</span>', () => act({ type: 'roll', playerId: pid }), { cls: 'roundbtn go' });
        break;

      case 'assign': {
        const dice = s.turn.dice!;
        const mb = calcMoveBonus(p);
        const fu = s.turn.focusUsed;
        html += '<div class="tray-title">ダイスを割り当てる</div><div class="dice">';
        dice.forEach((v, i) => {
          const die = i as 0 | 1;
          html += `<div class="die"><div class="face ${v <= 2 ? 'low' : ''}">${v}</div><div class="ops">
            ${btn('−1', () => act({ type: 'adjust', playerId: pid, die, delta: -1 }), { disabled: fu || p.focus < 1 || v <= 1, title: '集中1を使って出目-1（集中はターンに1回）' })}
            ${btn('+1', () => act({ type: 'adjust', playerId: pid, die, delta: 1 }), { disabled: fu || p.focus < 1, title: '集中1を使って出目+1（集中はターンに1回）' })}
            ${btn('↻', () => act({ type: 'reroll', playerId: pid, die }), { disabled: fu || p.focus < 2, title: '集中2を使って振り直す（集中はターンに1回）' })}
            ${btn(`⇄${s.teamDie}`, () => act({ type: 'swapTeamDie', playerId: pid, die }), { disabled: s.teamDieUsed, title: `チームダイス(${s.teamDie})と交換。この出目はチームダイスとして仲間に残る（チームで1ラウンド1回）` })}
          </div></div>`;
        });
        html += `<div class="die"><div class="face team">${s.teamDie}</div><div class="small">チーム</div></div>
          <div class="small">🎯集中 ${p.focus}/${focusMax(p)}${mb ? `<br>移動+${mb}` : ''}</div></div><div class="actions assign">`;
        for (const moveDie of [0, 1] as const) {
          const mv = dice[moveDie] + mb;
          const av = dice[moveDie === 0 ? 1 : 0];
          html += btn(`<span class="assign-btn"><b>🦶移動 ${mv} ／ ⚔️行動 ${av}</b><span class="small">マウスを乗せるとルートを表示</span></span>`,
            () => act({ type: 'assign', playerId: pid, moveDie }), { cls: 'primary assign-choice' });
        }
        html += '</div>';
        break;
      }

      case 'branch': {
        const zoneName = { outer: '外周', inner: '内周（ボスの隣）', spoke: '連絡路' } as const;
        html += `<div class="tray-title">分かれ道（残り${s.turn.moveRemaining}マス）</div><div class="small">ボード上の矢印をクリックして進む方向を選んでください</div><div class="actions">`;
        for (const to of s.turn.branchOptions) {
          const t = BOARD.tiles[to];
          html += btn(`${TILE_INFO[t.type].icon} ${zoneName[t.zone]}へ`, () => act({ type: 'branch', playerId: pid, to }));
        }
        html += '</div>';
        break;
      }

      case 'shop': {
        const isShop = s.turn.shopOffers.length > 0 || BOARD.tiles[p.tile].type === 'shop';
        html += `<div class="tray-title">${isShop ? '🛒 ショップ' : '🏠 拠点'}（🪙${p.coins}）</div>`;
        if (!s.turn.shopOffers.length) html += '<div class="small">ひと休み。レベルアップは左下のボタンからいつでもできます</div>';
        html += this.giftHtml(s, p);
        if (s.turn.shopOffers.length) {
          html += `<div class="small">カード（各🪙${CARD_PRICE}）</div><div class="actions">`;
          s.turn.shopOffers.forEach((id, index) => {
            const c = CARD_MAP[id];
            html += btn(`${CARD_ICON[id] ?? '🃏'} <b>${esc(c.name)}</b><br><span class="small">${esc(c.desc)}</span>`,
              () => act({ type: 'buyCard', playerId: pid, index }), { disabled: p.coins < CARD_PRICE || p.hand.length >= 3 });
          });
          html += '</div>';
        }
        main = btn('<span class="rb-icon">🚪</span><span class="rb-label">店を出る</span>', () => act({ type: 'leaveShop', playerId: pid }), { cls: 'roundbtn' });
        break;
      }

      case 'act': {
        const targets = targetsInRange(s, p);
        const cls = CLASSES[p.classId];
        html += `<div class="tray-title">行動（⚔️行動ダイス ${s.turn.actionValue}${p.buffs.power ? '・渾身×2' : ''}）</div><div class="actions">`;
        for (const t of targets) {
          const melee = t.kind === 'enemy' && isMelee(distTo(s, p.tile, t));
          html += btn(`${this.targetLabel(s, t)} に攻撃<br><span class="small">約${previewDamage(s, p, t)}ダメージ${melee ? '・反撃あり' : '・反撃なし'}</span>`,
            () => act({ type: 'attack', playerId: pid, target: t }), { cls: 'primary' });
        }
        if (!targets.length) html += `<span class="small">射程（${cls.range}）内に敵がいません</span>`;
        if (p.classId === 'archer') {
          for (const t of targets) {
            html += btn(`✨${esc(cls.skillName)}：${this.targetLabel(s, t)}<br><span class="small">${previewDamage(s, p, t, undefined, undefined, 0.7 + (p.skillLevel - 1) * 0.15)}×2</span>`,
              () => act({ type: 'skill', playerId: pid, target: t }), { disabled: p.skillCooldown > 0, title: cls.skillDesc });
          }
        }
        html += '</div>';
        html += this.giftHtml(s, p);
        const skillReady = p.skillCooldown === 0 && !(p.classId === 'mage' && !targets.length);
        if (p.classId !== 'archer') {
          skill = btn(`<span class="rb-icon">✨</span><span class="rb-label">${esc(cls.skillName)}</span>${p.skillCooldown ? `<span class="rb-cd">${p.skillCooldown}</span>` : ''}`,
            () => act({ type: 'skill', playerId: pid }), { cls: 'roundbtn small skill', disabled: !skillReady, title: cls.skillDesc });
        }
        main = btn('<span class="rb-icon">🛡</span><span class="rb-label">態勢を<br>整える</span>', () => act({ type: 'prepare', playerId: pid }),
          { cls: 'roundbtn', title: '攻撃せずに終わる：集中+1・HP+3' });
        break;
      }
      default:
        break;
    }
    tray.innerHTML = html;
    actions.innerHTML = `${skill}${main}`;
    this.bind();

    if (s.step === 'assign') {
      const dice = s.turn.dice!;
      const mb = calcMoveBonus(p);
      // 割り当てボタンにホバーするとルートを点線で表示
      [...document.querySelectorAll<HTMLButtonElement>('#tray .assign-choice')].forEach((b, i) => {
        const paths = walkDestinations(p.tile, p.prevTile, dice[i] + mb, enemyTiles(s)).map((d) => d.path);
        b.onmouseenter = () => this.scene.setRoutes(p.tile, paths);
        b.onmouseleave = () => this.scene.setRoutes(null, []);
      });
    }
    if (s.step === 'branch') {
      const go = (to: number) => { sound.play('click'); act({ type: 'branch', playerId: pid, to }); };
      this.scene.setHighlights(s.turn.branchOptions, go);
      this.scene.setBranchArrows(p.tile, s.turn.branchOptions, go);
      const blocked = enemyTiles(s);
      const routes = s.turn.branchOptions.flatMap((to) =>
        blocked.has(to) ? [[to]] : walkDestinations(to, p.tile, s.turn.moveRemaining - 1, blocked).map((d) => [to, ...d.path]));
      this.scene.setRoutes(p.tile, routes, 0xffcc4d);
    }
  }

  /** このターンにすれ違った仲間へコインを送るボタン */
  private giftHtml(s: GameState, p: Player): string {
    const allies = s.turn.passedAllies.filter((id) => !s.turn.giftedTo.includes(id));
    if (!allies.length) return '';
    return `<div class="small" style="margin-top:6px">🤝 すれ違った仲間にコインを送る（🪙${GIFT_COINS}）</div><div class="actions">${allies.map((id) => {
      const m = s.players[id];
      const gap = m.level < LEVEL_MAX ? Math.max(0, levelCost(m) - m.coins) : null;
      return this.btn(`<img class="mini" src="${bust(m)}" alt=""> ${esc(m.name)}へ🪙${GIFT_COINS}<br><span class="small">${gap === null ? '最大Lv' : gap === 0 ? 'Lvアップ可能' : `Lvアップまであと🪙${gap}`}</span>`,
        () => this.cb.dispatch({ type: 'giveCoins', playerId: p.id, targetId: id }), { disabled: p.coins < GIFT_COINS });
    }).join('')}</div>`;
  }

  /** 手札：扇形に並べた絵付きのカード */
  private handHtml(s: GameState, p: Player, myTurn: boolean) {
    if (!p.hand.length) return '<div class="hand-empty small">手札なし</div>';
    const n = p.hand.length;
    return p.hand.map((id, index) => {
      const c = CARD_MAP[id];
      const usable = myTurn && (['act', 'shop'].includes(s.step) ? c.timing === 'any' : s.step === 'assign');
      const angle = (index - (n - 1) / 2) * 7;
      const onClick = () => {
        if (!usable) return;
        if (c.target === 'ally') {
          this.pendingCard = index;
          this.render(s, false);
        } else {
          this.cb.dispatch({ type: 'useCard', playerId: p.id, index });
        }
      };
      const label = `<span class="card-top ${c.timing}">${c.timing === 'pre' ? '割り当て前' : 'いつでも'}</span>
        <span class="card-art"><img src="${ASSETS.cardArt(id)}" alt="" onerror="this.replaceWith(document.createTextNode('${CARD_ICON[id] ?? '🃏'}'))"></span><b>${esc(c.name)}</b><span class="card-desc">${esc(c.desc)}</span>`;
      return this.btn(label, onClick, { cls: `card ${usable ? 'usable' : ''}`, disabled: !usable, title: usable ? '' : c.timing === 'pre' ? 'ダイスの割り当て前だけ使えます' : '自分のターンに使えます' })
        .replace('<button ', `<button style="--a:${angle}deg;--y:${Math.abs(angle) * 0.6}px" `);
    }).join('');
  }

  private targetLabel(s: GameState, t: AttackTarget): string {
    if (t.kind === 'boss') return `🐉${esc(s.boss!.name)}`;
    const e = s.enemies.find((x) => x.id === t.id)!;
    return `${ENEMIES[e.kind].icon}${ENEMIES[e.kind].name}（HP${e.hp}）`;
  }

  // ───────────────────────── モーダル（ドラフト・リザルト） ─────────────────────────

  private renderModal(s: GameState, busy: boolean) {
    const modal = $('modal');
    if (s.result && !busy) {
      modal.hidden = false;
      modal.innerHTML = this.resultHtml(s);
      $('again').onclick = () => this.cb.restart();
      return;
    }
    const d = s.drafts[0];
    if (!d || !this.isHuman(d.playerId) || busy) {
      modal.hidden = true;
      modal.innerHTML = '';
      this.pendingChip = null;
      return;
    }
    const pid = d.playerId;
    const p = s.players[pid];
    const source = { supply: '📦 定期配給', kill: '⚔️ 撃破報酬', chest: '🎁 宝箱', boss: '🐉 決戦前の支援', fate: '🔮 神託' }[d.source];
    const full = p.chips.length >= p.chipSlots;
    // 初めて表示するドラフトだけ、カードをめくる演出を入れる
    const key = `${s.round}:${s.drafts.length}:${pid}:${d.options.join(',')}`;
    const reveal = this.revealedDraft !== key;
    this.revealedDraft = key;
    const odds = rarityOdds(s, p, d.source);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    let html = `<div class="dialog"><h2>${source}：${this.humans.size > 1 ? `${esc(p.name)}が` : ''}チップを1つ選ぶ</h2>
      <div class="small">同じタグを2個・4個そろえるとセットボーナス。<b>レベルを上げるほど・ラウンドが進むほど</b>レアが出やすくなります。</div>
      <div class="odds">レア出現率（Lv${p.level}）：<span class="rar-1">ブロンズ ${pct(odds[0])}</span><span class="rar-2">シルバー ${pct(odds[1])}</span><span class="rar-3">ゴールド ${pct(odds[2])}</span></div>
      <div class="grid chip-grid">`;
    // めくる順番：レアなものほど後に（最後に金がめくれると盛り上がる）
    const order = d.options.map((id, i) => ({ i, tier: CHIP_MAP[id].tier })).sort((a, b) => a.tier - b.tier || a.i - b.i).map((o) => o.i);
    d.options.forEach((id, i) => {
      const c = CHIP_MAP[id];
      const owned = p.chips.filter((x) => CHIP_MAP[x].tag === c.tag).length;
      const delay = reveal ? 250 + order.indexOf(i) * 380 : 0;
      html += `<button class="chipcard rar-${c.tier} ${reveal ? 'reveal' : ''} ${this.pendingChip === i ? 'selected' : ''}" data-pick="${i}" style="--d:${delay}ms">
        <span class="cc-inner">
          <span class="cc-back">🎲</span>
          <span class="cc-front">
            <span class="cc-rank">${RARITY[c.tier]}</span>
            <span class="big">${TAGS[c.tag].icon}</span><b>${esc(c.name)} ${'★'.repeat(c.tier)}</b>
            <span>${esc(c.desc)}</span><span class="small">${TAGS[c.tag].name}タグ（所持${owned}）｜2セット:${esc(TAGS[c.tag].set2)}／4セット:${esc(TAGS[c.tag].set4)}</span>
          </span>
        </span></button>`;
    });
    html += '</div>';
    if (full && this.pendingChip !== null) {
      html += '<h3>枠がいっぱいです。外すチップを選んでください</h3><div class="grid">';
      p.chips.forEach((id, i) => {
        const c = CHIP_MAP[id];
        html += `<button class="opt rar-${c.tier}" data-replace="${i}"><b>${TAGS[c.tag].icon}${esc(c.name)}</b><span class="small">${esc(c.desc)}</span></button>`;
      });
      html += '</div>';
    }
    html += `<div class="actions"><button id="skipchip">見送る（売却して🪙+${CHIP_SELL_COINS}）</button>
      <span class="small" style="align-self:center">チップ枠 ${p.chips.length}/${p.chipSlots}（レベルが上がるたびに+1）</span></div></div>`;
    modal.hidden = false;
    modal.innerHTML = html;
    if (reveal) {
      order.forEach((i, k) => window.setTimeout(() => sound.play(CHIP_MAP[d.options[i]].tier === 3 ? 'gold' : CHIP_MAP[d.options[i]].tier === 2 ? 'silver' : 'flip'), 250 + k * 380));
    }
    modal.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => {
      b.onclick = () => {
        const index = Number(b.dataset.pick);
        sound.play('click');
        if (full) {
          this.pendingChip = index;
          this.renderModal(s, false);
        } else {
          this.cb.dispatch({ type: 'pickChip', playerId: pid, index });
        }
      };
    });
    modal.querySelectorAll<HTMLButtonElement>('[data-replace]').forEach((b) => {
      b.onclick = () => {
        const index = this.pendingChip!;
        this.pendingChip = null;
        this.cb.dispatch({ type: 'pickChip', playerId: pid, index, replace: Number(b.dataset.replace) });
      };
    });
    $('skipchip').onclick = () => {
      this.pendingChip = null;
      this.cb.dispatch({ type: 'pickChip', playerId: pid, index: null });
    };
  }

  private resultHtml(s: GameState): string {
    const ranked = [...s.players].sort((a, b) => contributionScore(b) - contributionScore(a));
    const top = (f: (p: Player) => number) => s.players.reduce((a, b) => (f(b) > f(a) ? b : a));
    const avg = (p: Player) => p.luck.sum / Math.max(1, p.luck.rolls);
    const awards = [
      ['🏆 MVP', ranked[0]],
      ['⚔️ 最多ダメージ', top((p) => p.contrib.damage)],
      ['🤝 縁の下の力持ち', top((p) => p.contrib.support)],
      ['🍀 最強の豪運', top(avg)],
      ['🌧 不運の星', top((p) => -avg(p))],
    ] as const;
    return `<div class="dialog">
      <h2>${s.result === 'win' ? '🎉 勝利！ボスを倒した！' : '💀 敗北……'}</h2>
      <div class="small">${s.result === 'win' ? `ラウンド${s.round}で討伐` : s.teamLife <= 0 ? 'チームライフが尽きた' : `時間切れ（ボス残りHP ${s.boss?.hp ?? '-'}）`}</div>
      <table class="rank"><tr><th>#</th><th>プレイヤー</th><th>貢献度</th><th>与ダメ</th><th>撃破</th><th>支援</th><th>KO</th><th>平均出目</th></tr>
      ${ranked.map((p, i) => `<tr><td>${i + 1}</td><td><img class="mini" src="${bust(p)}" alt=""> ${esc(p.name)}</td><td><b>${contributionScore(p)}</b></td>
        <td>${p.contrib.damage}</td><td>${p.contrib.kills}</td><td>${p.contrib.support}</td><td>${p.contrib.ko}</td><td>${avg(p).toFixed(2)}</td></tr>`).join('')}
      </table>
      <div class="awards">${awards.map(([name, p]) => `<div class="award">${name}<br><b>${esc(p.name)}</b></div>`).join('')}</div>
      <div class="actions" style="margin-top:14px"><button id="again" class="primary">もう一度遊ぶ</button></div></div>`;
  }
}
