// まぎれろ！の3Dの舞台を画面に置く（three.js は、この部品を開いた人だけが読み込む）
import { useEffect, useRef } from 'react';
import { BlendScene, type BlendHandlers, type BlendStageState } from './scene';

export default function BlendStage3D({ state, on, onFail }: { state: BlendStageState; on: BlendHandlers; onFail(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<BlendScene | null>(null);
  const handlers = useRef(on);
  handlers.current = on;
  useEffect(() => {
    // 3D（WebGL）が使えない端末では、その旨を出す
    try { scene.current = new BlendScene(canvas.current!, { onFloor: (x, z) => handlers.current.onFloor(x, z), onPick: i => handlers.current.onPick(i) }); } catch { onFail(); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.update(state); });
  return <canvas ref={canvas} className="mstage3d" />;
}
