/* A tiny IndexedDB key-value store. Same database name as the HTML version. */
export const idb = <T = unknown>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void) =>
  new Promise<T>((res, rej) => {
    const r = indexedDB.open('fmarea', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onsuccess = () => {
      const tx = r.result.transaction('h', mode);
      const q = fn(tx.objectStore('h'));
      tx.oncomplete = () => res((q && q.result) as T);
      tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  });
