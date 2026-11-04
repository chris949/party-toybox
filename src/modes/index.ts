// ゲームモードの一覧。モードを足すときは、同じ形のものをここに並べる
import * as tier from './tier/rules';
import { viewFor } from './tier/view';

export const tierMode = {
  id: 'tier',
  name: 'ティアリストウォーズ',
  start: tier.start,
  startError: tier.startError,
  reduce: tier.reduce,
  checkAdvance: tier.checkAdvance,
  nextTimer: tier.nextTimer,
  view: viewFor,
};
