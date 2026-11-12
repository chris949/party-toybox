// 3Dの舞台を画面に置く（three.js は、この部品を開いた人だけが読み込む）
import { useEffect, useRef } from 'react';
import { moveFate } from '../../../app/store';
import type { StageState } from '../stage';
import { FateScene } from './scene';

export default function Stage3D({ state, onFail }: { state: StageState; onFail(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<FateScene | null>(null);
  useEffect(() => {
    // 3D（WebGL）が使えない端末では、2D表示に戻す
    try { scene.current = new FateScene(canvas.current!, moveFate); } catch { onFail(); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.update(state); });
  return <canvas ref={canvas} className="fstage3d" />;
}
