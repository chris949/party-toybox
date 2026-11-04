// 各自が選んだ曲を、その端末のブラウザの中（IndexedDB）に保存する。曲ファイルは大きく localStorage には入らないため
const DB = 'tlw-audio', STORE = 'bgm';

export interface CustomTrack { name: string; type: string; blob: Blob }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = f(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCustomTracks(): Promise<Record<string, CustomTrack>> {
  try {
    const db = await open();
    return await new Promise(resolve => {
      const out: Record<string, CustomTrack> = {};
      const req = db.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out[String(c.key)] = c.value as CustomTrack;
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
  } catch { return {}; } // 保存できない環境（プライベートブラウズなど）では、各自の曲は使えない
}

export const saveCustomTrack = (scene: string, t: CustomTrack) => tx('readwrite', s => s.put(t, scene));
export const deleteCustomTrack = (scene: string) => tx('readwrite', s => s.delete(scene));
