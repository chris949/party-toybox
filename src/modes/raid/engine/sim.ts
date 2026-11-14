import { decideAction } from './ai';
import { CLASS_IDS } from './data/classes';
import { applyAction, createGame } from './engine';
import type { GameState, Mode } from './types';

/** CPUだけで1試合を最後まで回す（テスト・バランス調整用） */
export function playOut(seed: number, mode: Mode, maxActions = 5000): { state: GameState; actions: number } {
  let s = createGame({
    seed,
    mode,
    players: CLASS_IDS.map((classId, i) => ({ name: `CPU${i + 1}`, classId, isCpu: true })),
  });
  let n = 0;
  while (!s.result) {
    if (++n > maxActions) throw new Error(`試合が終わらない（seed=${seed}）`);
    s = applyAction(s, decideAction(s)).state;
  }
  return { state: s, actions: n };
}
