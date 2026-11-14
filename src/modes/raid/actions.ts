// 参加者から届いた操作を検査して、engine に渡せる形に整える（知らない形のものは捨てる）。
// 誰の操作か（playerId）は、ここでは決めない。ルールが、送ってきた人の席から決める
import type { Action as RaidAction } from './engine';

const int = (v: unknown): v is number => Number.isInteger(v);
const die = (v: unknown): v is 0 | 1 => v === 0 || v === 1;

export function sanitizeRaidAction(raw: unknown): RaidAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const playerId = 0; // 仮の値（ルールが席の番号で上書きする）
  const target = (v: unknown) => {
    const t = v as { kind?: unknown; id?: unknown } | undefined;
    return t?.kind === 'boss' ? { kind: 'boss' as const } : t?.kind === 'enemy' && int(t.id) ? { kind: 'enemy' as const, id: t.id } : null;
  };
  switch (a.type) {
    case 'roll': case 'leaveShop': case 'prepare': return { type: a.type, playerId };
    case 'adjust': return die(a.die) && (a.delta === 1 || a.delta === -1) ? { type: 'adjust', playerId, die: a.die, delta: a.delta } : null;
    case 'reroll': case 'swapTeamDie': return die(a.die) ? { type: a.type, playerId, die: a.die } : null;
    case 'assign': return die(a.moveDie) ? { type: 'assign', playerId, moveDie: a.moveDie } : null;
    case 'branch': return int(a.to) ? { type: 'branch', playerId, to: a.to } : null;
    case 'useCard': return int(a.index) && (a.targetId == null || int(a.targetId)) ? { type: 'useCard', playerId, index: a.index, ...(int(a.targetId) ? { targetId: a.targetId } : {}) } : null;
    case 'levelUp': return a.choice === 'stats' || a.choice === 'skill' ? { type: 'levelUp', playerId, choice: a.choice } : null;
    case 'buyCard': return int(a.index) ? { type: 'buyCard', playerId, index: a.index } : null;
    case 'attack': { const t = target(a.target); return t ? { type: 'attack', playerId, target: t } : null; }
    case 'skill': { const t = a.target == null ? undefined : target(a.target); return t === null ? null : { type: 'skill', playerId, ...(t ? { target: t } : {}) }; }
    case 'react': return a.choice === 'defend' || a.choice === 'evade' ? { type: 'react', playerId, choice: a.choice } : null;
    case 'giveCoins': return int(a.targetId) ? { type: 'giveCoins', playerId, targetId: a.targetId } : null;
    case 'pickChip': return (a.index === null || int(a.index)) && (a.replace == null || int(a.replace))
      ? { type: 'pickChip', playerId, index: a.index as number | null, ...(int(a.replace) ? { replace: a.replace } : {}) } : null;
    default: return null;
  }
}
