import { BOSS, CLASSES, ENEMIES, calcDef, calcEvd, evadeChance, expectedDefend } from '../../src/modes/raid/engine';
import type { BattleResult, ClassId, EnemyKind, EntityRef, GameEvent, GameState, PendingAttack, Player, ReactChoice } from '../../src/modes/raid/engine';
import { PLAYER_COLORS } from './scene';
import { DomSd, sdScale } from './sd';
import { sound } from './sound';

/** 飛び道具タイプ（エフェクトが相手まで飛んでいく）か、相手の位置に出るタイプか */
const PROJECTILE: Record<ClassId, boolean> = { mage: true, archer: true, warrior: false, priest: false };
/** 近接職は攻撃時に踏み込む */
const MELEE: Record<ClassId, boolean> = { warrior: true, mage: false, priest: false, archer: false };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** 立ち絵（全身）と胸像の画像パス */
export const portrait = (p: Player) => `chars/${p.classId}.png`;
export const bust = (p: Player) => `chars/${p.classId}_bust.png`;

interface Figure {
  classId?: ClassId;
  /** SDの種類（職業・ザコ・ボス） */
  sdKey: string;
  name: string;
  color: string;
  /** 立ち絵があればそのパス、なければ絵文字 */
  image?: string;
  icon: string;
  isPlayer: boolean;
}

/** 敵のIDから種類を引く（倒された敵も表示できるよう、見たことのある敵を覚えておく） */
export class EntityBook {
  private enemies = new Map<number, EnemyKind>();
  remember(s: GameState) {
    for (const e of s.enemies) this.enemies.set(e.id, e.kind);
  }
  describe(s: GameState, ref: EntityRef): Figure {
    if (ref.kind === 'player') {
      const p = s.players[ref.id];
      return { classId: p.classId, sdKey: p.classId, icon: CLASSES[p.classId].icon, name: p.name, color: hex(PLAYER_COLORS[p.id]), image: portrait(p), isPlayer: true };
    }
    if (ref.kind === 'boss') return { sdKey: 'boss', icon: BOSS.icon, name: s.boss?.name ?? BOSS.name, color: '#ff5d6c', isPlayer: false };
    const kind = this.enemies.get(ref.id) ?? 'slime';
    return { sdKey: kind, icon: ENEMIES[kind].icon, name: ENEMIES[kind].name, color: '#c0485a', isPlayer: false };
  }
}

/**
 * 画面中央に出す演出（ダイス、マスのイベント、ターン開始、戦闘シーン）。
 * 描画ループに依存しないDOMで作り、setTimeoutで進める。
 */
export class Overlay {
  private root: HTMLElement;
  private reacting = false;
  private sds = new Map<string, DomSd>();
  speed = 1;

  constructor(private book: EntityBook, private humans: Set<number>) {
    this.root = document.createElement('div');
    this.root.id = 'overlay';
    document.body.appendChild(this.root);
  }

  /** クリックで演出を早送り中 */
  skipping = false;

  private wait(ms: number) {
    return sleep(this.skipping ? Math.min(ms, 40) : ms / this.speed);
  }

  get isReacting() {
    return this.reacting;
  }

  private show(html: string, cls = '') {
    this.root.className = `show ${cls}`;
    this.root.innerHTML = html;
  }

  hide() {
    for (const sd of this.sds.values()) sd.destroy();
    this.sds.clear();
    this.reacting = false;
    this.root.className = '';
    this.root.innerHTML = '';
  }

  hideReact() {
    if (this.reacting) this.hide();
  }

  /** figure() で置いた枠にSDキャラを入れる */
  private mountSds() {
    this.root.querySelectorAll<HTMLElement>('[data-slot]').forEach((slot) => {
      const key = slot.dataset.key!;
      const sd = new DomSd(key, sdScale(key, 'battle'), slot.dataset.left === 'true');
      slot.appendChild(sd.el);
      this.sds.set(slot.dataset.slot!, sd);
    });
  }

  /** エフェクト画像を出す。飛び道具なら攻撃側から相手へ飛ばす */
  private async shootFx(sd: DomSd, from: HTMLElement, to: HTMLElement, projectile: boolean, ms: number) {
    const fx = sd.fxOffset();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const toRight = b.left > a.left;
    const img = document.createElement('img');
    img.src = fx.file;
    img.className = 'fx-img';
    img.style.width = `${fx.w}px`;
    if (!toRight) img.style.transform = 'scaleX(-1)';
    // 足元＝枠の下端中央
    const startX = a.left + a.width / 2 + (toRight ? fx.x : -fx.x) - fx.w / 2;
    const startY = a.bottom + fx.y - fx.h / 2;
    const endX = b.left + b.width / 2 - fx.w / 2;
    const endY = b.top + b.height * 0.45 - fx.h / 2;
    this.root.appendChild(img);
    if (projectile) {
      img.style.left = `${startX}px`;
      img.style.top = `${startY}px`;
      img.animate([
        { transform: `translate(0,0)${toRight ? '' : ' scaleX(-1)'}` },
        { transform: `translate(${endX - startX}px, ${endY - startY}px)${toRight ? '' : ' scaleX(-1)'}` },
      ], { duration: ms / this.speed, easing: 'ease-in', fill: 'forwards' });
    } else {
      img.style.left = `${endX}px`;
      img.style.top = `${endY}px`;
      img.animate([
        { opacity: 0, transform: `scale(.6)${toRight ? '' : ' scaleX(-1)'}` },
        { opacity: 1, transform: `scale(1.15)${toRight ? '' : ' scaleX(-1)'}`, offset: 0.5 },
        { opacity: 0, transform: `scale(1.3)${toRight ? '' : ' scaleX(-1)'}` },
      ], { duration: (ms * 1.6) / this.speed, easing: 'ease-out', fill: 'forwards' });
    }
    await this.wait(ms);
    window.setTimeout(() => img.remove(), (ms * 1.2) / this.speed);
  }

  /** CSSアニメーションを最初から再生し、終わるまで待つ */
  private async animate(el: Element | null, cls: string, ms: number) {
    if (!el) return;
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    (el as HTMLElement).style.animationDuration = `${ms / this.speed}ms`;
    el.classList.add(cls);
    await this.wait(ms);
    el.classList.remove(cls);
  }

  /** ダイスがくるくる回ってから止まる */
  private async spin(el: HTMLElement | null, final: number, ms: number) {
    if (!el) return;
    const end = performance.now() + ms / this.speed;
    el.classList.add('spinning');
    while (performance.now() < end) {
      el.textContent = String(1 + Math.floor(Math.random() * 6));
      await sleep(60);
    }
    el.classList.remove('spinning');
    el.textContent = String(final);
    el.classList.add('landed');
  }

  /** ターン開始のカットイン（立ち絵が横からスライドイン） */
  async turnCutin(p: Player) {
    const mine = this.humans.has(p.id);
    if (mine) sound.play('turn');
    if (!mine && this.speed >= 4) return;
    this.show(`<div class="cutin" style="--c:${hex(PLAYER_COLORS[p.id])}">
      <div class="cutin-band"></div>
      <img class="cutin-img" src="${portrait(p)}" alt="">
      <div class="cutin-text"><div class="small">${CLASSES[p.classId].name}</div><b>${esc(p.name)}のターン</b></div>
    </div>`, 'cutin-bg');
    await this.wait(mine ? 1100 : 650);
    this.hide();
  }

  async play(e: GameEvent, s: GameState): Promise<boolean> {
    switch (e.t) {
      case 'roll': {
        const p = s.players[e.pid];
        const mine = this.humans.has(p.id);
        if (!mine && this.speed >= 4) return true;
        sound.play('dice');
        this.show(`<div class="ov-card"><div class="ov-title"><img class="ov-bust" src="${bust(p)}" alt=""> ${esc(p.name)} のダイス</div>
          <div class="ov-dice"><span class="bigdie" id="od0">?</span><span class="bigdie" id="od1">?</span></div>
          ${e.doubles ? '<div class="ov-big good" id="odz" style="visibility:hidden">ゾロ目！ 両方+2</div>' : ''}</div>`);
        await Promise.all([this.spin(document.getElementById('od0'), e.dice[0], 500), this.spin(document.getElementById('od1'), e.dice[1], 650)]);
        sound.play('diceLand');
        const z = document.getElementById('odz');
        if (z) z.style.visibility = 'visible';
        await this.wait(mine ? 450 : 300);
        this.hide();
        return true;
      }
      case 'event': {
        const p = s.players[e.pid];
        sound.play(e.good ? 'good' : 'bad');
        this.show(`<div class="ov-card event ${e.good ? 'good' : 'bad'}"><div class="ov-icon">${e.icon}</div>
          <div class="ov-title">${esc(e.title)}</div><div>${esc(e.text)}</div><div class="small">${esc(p.name)}</div></div>`);
        await this.wait(this.humans.has(p.id) ? 1100 : 700);
        this.hide();
        return true;
      }
      case 'battle':
        await this.battle(e.result, s);
        return true;
      default:
        return false;
    }
  }

  /** 戦うキャラ1体分：上にATTACK/DEFENSEの札、足元にHP */
  private figure(f: Figure, id: string, side: 'left' | 'right', role: 'atk' | 'def', badge: string, hp: number) {
    // 左側のキャラは右を向き、右側のキャラは左を向く
    const body = `<div class="sd-slot" data-slot="${id}" data-key="${f.sdKey}" data-left="${side === 'right'}"></div>`;
    return `<div class="bt-fig ${side}" id="${id}" style="--c:${f.color}">
      <div class="badge ${role}"><span class="bl">${role === 'atk' ? 'ATTACK' : 'DEFENSE'}</span>${badge}</div>
      <div class="bt-art has-sd">${body}</div>
      <div class="hearts" id="${id}-hp">❤ ${Math.max(0, hp)}</div>
      <div class="bt-tag"><b>${esc(f.name)}</b></div>
      <div class="bt-pop" id="${id}-pop"></div></div>`;
  }

  private hpOf(s: GameState, ref: EntityRef): number {
    if (ref.kind === 'player') return s.players[ref.id].hp;
    if (ref.kind === 'boss') return s.boss?.hp ?? 0;
    return s.enemies.find((e) => e.id === ref.id)?.hp ?? 0;
  }

  /** プレイヤーはいつも左、敵は右に置く */
  private layout(s: GameState, attacker: EntityRef, target: EntityRef) {
    const a = this.book.describe(s, attacker);
    const t = this.book.describe(s, target);
    const attackerLeft = a.isPlayer || !t.isPlayer;
    return { a, t, attackerLeft };
  }

  /** 戦闘シーン：出目 → 突進 → 被弾/回避 → 結果 */
  private async battle(r: BattleResult, s: GameState) {
    const involvesHuman = (r.attacker.kind === 'player' && this.humans.has(r.attacker.id)) || (r.target.kind === 'player' && this.humans.has(r.target.id));
    const fast = !involvesHuman;
    if (fast && this.speed >= 4) return;
    const { a, t, attackerLeft } = this.layout(s, r.attacker, r.target);
    const choiceLabel = r.target.kind === 'boss' ? '受ける' : r.choice === 'evade' ? '💨回避' : '🛡防御';
    // 敵の防御はダイスを振らない（防御力のみ）
    const showDef = r.target.kind === 'player' || (r.target.kind === 'enemy' && r.choice === 'evade');
    const atkBadge = `<span class="bigdie" id="ba">?</span><span class="bt-num">攻撃力<b id="bp">?</b></span>`;
    const defBadge = `<span class="bt-choice">${choiceLabel}</span>${showDef ? '<span class="bigdie" id="bd">?</span>' : ''}`;
    const atkFig = this.figure(a, 'fa', attackerLeft ? 'left' : 'right', 'atk', atkBadge, this.hpOf(s, r.attacker));
    const defHp = this.hpOf(s, r.target);
    const defFig = this.figure(t, 'fd', attackerLeft ? 'right' : 'left', 'def', defBadge, defHp);
    this.show(`<div class="battle-stage arena">
      <div class="arena-word">BATTLE</div>
      <div class="bt-label">${esc(r.label)}</div>
      <div class="bt-arena">
        ${attackerLeft ? atkFig : defFig}
        <div class="bt-vs">VS</div>
        ${attackerLeft ? defFig : atkFig}
      </div>
      <div class="bt-result" id="br"></div></div>`, 'battle-bg');
    this.mountSds();

    await this.spin(document.getElementById('ba'), r.roll, fast ? 250 : 500);
    document.getElementById('bp')!.textContent = String(r.power);
    await this.wait(fast ? 120 : 250);
    if (showDef) await this.spin(document.getElementById('bd'), r.defRoll, fast ? 250 : 450);

    const atkEl = document.getElementById('fa')!;
    const defEl = document.getElementById('fd')!;
    const atkSd = this.sds.get('fa');
    const defSd = this.sds.get('fd');
    const pop = document.getElementById('fd-pop')!;
    const k = fast ? 0.7 : 1;

    // 攻撃：SDキャラは攻撃モーション＋エフェクト、モンスターは突進
    let lunge: Promise<void> = Promise.resolve();
    if (atkSd && a.classId) {
      sound.play(a.classId === 'mage' || a.classId === 'priest' ? 'magic' : a.classId === 'archer' ? 'arrow' : 'swing');
      const swing = atkSd.play('attack', this.speed);
      if (MELEE[a.classId]) lunge = this.animate(atkEl, attackerLeft ? 'step-r' : 'step-l', 420 * k);
      await this.wait(170 * k);
      await this.shootFx(atkSd, atkEl, defEl, PROJECTILE[a.classId], 260 * k);
      void swing;
    } else {
      // モンスター：攻撃モーションで体当たり
      sound.play('swing');
      void atkSd?.play('attack', this.speed);
      lunge = this.animate(atkEl, attackerLeft ? 'lunge-r' : 'lunge-l', 420 * k);
      await this.wait(210 * k);
    }

    // 被弾 or 回避
    if (r.evaded) {
      sound.play('evade');
      pop.innerHTML = '<span class="miss">MISS</span>';
      await this.animate(defEl, attackerLeft ? 'dodge-r' : 'dodge-l', 450 * k);
    } else {
      if (!defSd) {
        const slash = document.createElement('div');
        slash.className = 'slash';
        defEl.appendChild(slash);
        window.setTimeout(() => slash.remove(), 450 * k / this.speed);
      }
      sound.play('hit');
      pop.innerHTML = `<span class="dmg">-${r.damage}</span>`;
      const hpEl = document.getElementById('fd-hp');
      if (hpEl) hpEl.textContent = `❤ ${Math.max(0, defHp - r.damage)}`;
      // 被弾ポーズを約1秒キープし、攻撃と反対方向へノックバック
      void defSd?.play('hit', this.speed);
      void this.animate(defEl.querySelector('.bt-art'), attackerLeft ? 'knock-r' : 'knock-l', 1000 * k);
      await this.animate(defEl, 'hit', 450 * k);
      await this.wait(550 * k);
    }
    await lunge;
    void atkSd?.play('idle');
    void defSd?.play('idle');

    const res = document.getElementById('br')!;
    if (r.evaded) {
      res.innerHTML = '<span class="good">回避成功！ ダメージ0</span>';
    } else if (r.choice === 'evade' && !r.noEvade && r.target.kind !== 'boss') {
      res.innerHTML = `<span class="bad">回避失敗… ${r.damage}ダメージ</span>`;
    } else {
      const guard = r.target.kind === 'player' ? `（防御力${r.guard - r.defRoll}＋出目${r.defRoll}）` : `防御${r.guard}`;
      res.innerHTML = `<span class="${r.target.kind === 'player' ? 'bad' : 'good'}">${r.power} − ${guard} ＝ ${r.damage}ダメージ${r.damage === 1 && r.target.kind === 'player' ? '（最低1）' : ''}</span>`;
    }
    res.classList.add('pop');
    await this.wait(fast ? 450 : 900);
    this.hide();
  }

  /** 攻撃を受ける側の選択（防御/回避）。結果予測を出して選んでもらう */
  renderReact(s: GameState, a: PendingAttack, onChoose: (c: ReactChoice) => void) {
    const p = s.players[(a.target as { id: number }).id];
    const def = calcDef(p);
    const expDef = expectedDefend(a.power, def);
    const minDef = Math.max(1, a.power - def - 6);
    const maxDef = Math.max(1, a.power - def - 1);
    const chance = evadeChance(a.roll, calcEvd(p));
    const { a: af, t: tf } = this.layout(s, a.attacker, a.target);
    this.show(`<div class="battle-stage arena">
      <div class="arena-word">BATTLE</div>
      <div class="bt-label">${esc(a.label)}！</div>
      <div class="bt-arena">
        ${this.figure(tf, 'fd', 'left', 'def', '<span class="bt-choice">どうする？</span>', p.hp)}
        <div class="bt-vs">VS</div>
        ${this.figure(af, 'fa', 'right', 'atk', `<span class="bigdie landed">${a.roll}</span><span class="bt-num">攻撃力<b>${a.power}</b></span>`, this.hpOf(s, a.attacker))}
      </div>
      <div class="bt-choices">
        <button class="bt-btn" id="rdef"><b>🛡 防御</b><span>ダイス＋防御${def}で軽減</span>
          <span>被ダメージ ${minDef}〜${maxDef}（平均${expDef.toFixed(1)}）</span>${maxDef >= p.hp ? '<span class="bad">倒れる可能性あり</span>' : ''}</button>
        <button class="bt-btn" id="reva" ${a.noEvade ? 'disabled' : ''}><b>💨 回避</b>
          ${a.noEvade ? '<span>この攻撃は回避できない</span>' : `<span>${a.roll}より大きい目（または6）で0ダメージ</span>
          <span>成功率 ${Math.round(chance * 100)}%／失敗すると ${a.power}ダメージ</span>${a.power >= p.hp ? '<span class="bad">失敗すると倒れる</span>' : ''}`}</button>
      </div></div>`, 'battle-bg');
    this.mountSds();
    this.reacting = true;
    document.getElementById('rdef')!.onclick = () => onChoose('defend');
    const eva = document.getElementById('reva') as HTMLButtonElement;
    if (!a.noEvade) eva.onclick = () => onChoose('evade');
  }
}
