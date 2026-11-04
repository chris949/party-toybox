// 並び替え。画面下の選択肢をタップすると空いている一番上へ。ドラッグなら好きな順位の枠へ。
// 指は少し長押ししてからドラッグ（すぐ動かすと画面がスクロールする）
import { useEffect, useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Sound } from '../../../audio/sound';
import { dropInto, ensurePicker, place, submitPick, swap, unplace, useStore } from '../../../app/store';
import { Badge } from '../../../ui/common';

interface DragData { item: number; from: number | null }

export function Picker({ options, pickKey, timeUp }: { options: string[]; pickKey: string; timeUp: boolean }) {
  const n = options.length;
  useEffect(() => ensurePicker(pickKey, n), [pickKey, n]);
  const picker = useStore(s => s.picker);
  const pending = useStore(s => s.pending);
  const phase = useStore(s => s.pub?.phase);
  const [active, setActive] = useState<DragData | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  if (picker.key !== pickKey) return null;
  const slots = picker.slots;

  if (!pending && timeUp) {
    return <>
      <div className="timeup pop">時間切れ！</div>
      <p className="muted small" style={{ textAlign: 'center' }}>{phase === 'ranking' ? '並べられなかった分は、ランダムで埋めます' : '今回は未提出です（0点）'}</p>
    </>;
  }

  const pool = options.map((_, i) => i).filter(i => !slots.includes(i));
  const left = pool.length, done = left === 0;
  const onStart = (e: DragStartEvent) => setActive(e.active.data.current as DragData);
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const t = e.over?.data.current?.slot as number | undefined;
    const d = e.active.data.current as DragData;
    if (t == null || d.from === t) return;
    dropInto(d.item, t, d.from);
    Sound.play('click');
  };

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)} autoScroll>
      <p className="muted small">画面下の選択肢をタップ、またはつかんで順位の枠へ（指は少し長押し）。並べた項目はつかむか ▲▼ で入れ替え、タップで戻せます。</p>
      {slots.map((idx, r) => <Slot key={r} r={r} n={n} idx={idx} label={idx != null ? options[idx] : ''} />)}
      <Tray>
        <div className="hint">{done ? '並べ終わりました。つかむか ▲▼ で入れ替えもできます' : `${slots.indexOf(null) + 1}位に入れるものをタップ（残り${left}つ）`}</div>
        {pool.length > 0 && <div className="pool">{pool.map(i => <Chip key={i} i={i} label={options[i]} />)}</div>}
        <button className="primary wide" disabled={!done || !!pending} onClick={submitPick}>
          {pending ? '送信中…' : done ? 'この順位で決定' : `あと${left}つ並べると決定できます`}
        </button>
      </Tray>
      <DragOverlay dropAnimation={null}>
        {active && <div className="drag-ghost">{options[active.item]}</div>}
      </DragOverlay>
    </DndContext>
  );
}

function Slot({ r, n, idx, label }: { r: number; n: number; idx: number | null; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${r}`, data: { slot: r } });
  const drag = useDraggable({ id: `placed-${r}`, data: { item: idx ?? -1, from: r } satisfies DragData, disabled: idx == null });
  return (
    <div className={`slot ${isOver ? 'drop' : ''}`} ref={setNodeRef}>
      <Badge r={r} n={n} />
      {idx != null ? <>
        <button className={`item ${drag.isDragging ? 'dragging' : ''}`} ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} onClick={() => unplace(r)}>
          <span className="grip" aria-hidden="true">⠿</span>{label}
        </button>
        <button className="mini" disabled={r === 0} onClick={() => swap(r - 1, r)}>▲</button>
        <button className="mini" disabled={r === n - 1} onClick={() => swap(r, r + 1)}>▼</button>
      </> : <span className="empty">　</span>}
    </div>
  );
}

function Chip({ i, label }: { i: number; label: string }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `pool-${i}`, data: { item: i, from: null } satisfies DragData });
  return <button className={`chip ${isDragging ? 'dragging' : ''}`} ref={setNodeRef} {...listeners} {...attributes} onClick={() => place(i)}>{label}</button>;
}

// 画面下に固定する選択肢の置き場。出ている間はページの下に余白をとる
function Tray({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const app = document.getElementById('app')!;
    app.classList.add('has-tray');
    return () => app.classList.remove('has-tray');
  }, []);
  return <div className="tray"><div className="tray-in">{children}</div></div>;
}
