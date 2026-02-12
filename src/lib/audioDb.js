// IndexedDB wrapper for persisting audio library and presets
// Stores raw ArrayBuffers (AudioBuffers can't be serialized)

const DB_NAME = 'visual-sound-mixer';
const DB_VERSION = 2;
const LIBRARY_STORE = 'library';
const PRESETS_STORE = 'presets';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
        db.createObjectStore(LIBRARY_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(PRESETS_STORE)) {
        db.createObjectStore(PRESETS_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ===== Library (audio files) =====

export async function saveToDb(name, arrayBuffer) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(LIBRARY_STORE);
    const req = store.add({ name, audioData: arrayBuffer });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllFromDb() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readonly');
    const store = tx.objectStore(LIBRARY_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIdsFromDb(ids) {
  const db = await openDb();
  const tx = db.transaction(LIBRARY_STORE, 'readonly');
  const store = tx.objectStore(LIBRARY_STORE);
  const results = [];
  for (const id of ids) {
    const item = await new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (item) results.push(item);
  }
  return results;
}

export async function removeFromDb(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(LIBRARY_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ===== Presets =====

export async function savePreset(preset) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readwrite');
    const store = tx.objectStore(PRESETS_STORE);
    const req = store.put(preset); // put = upsert
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPresets() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readonly');
    const store = tx.objectStore(PRESETS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePreset(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readwrite');
    const store = tx.objectStore(PRESETS_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
