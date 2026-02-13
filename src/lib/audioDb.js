// IndexedDB wrapper for persisting audio library and presets
// Stores raw ArrayBuffers (AudioBuffers can't be serialized)
//
// Two DB types:
// - Admin DB ("visual-sound-mixer"): presets, library, shares — admin only
// - Player DB ("vsm-player-{shareId}"): presets + library per share session

const DB_NAME = 'visual-sound-mixer';
const DB_VERSION = 3;
const LIBRARY_STORE = 'library';
const PRESETS_STORE = 'presets';
const SHARES_STORE = 'shares';

const PLAYER_DB_VERSION = 1;

function openDb(dbName = DB_NAME, version = DB_VERSION) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
        db.createObjectStore(LIBRARY_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(PRESETS_STORE)) {
        db.createObjectStore(PRESETS_STORE, { keyPath: 'id', autoIncrement: true });
      }
      // Shares store only in admin DB
      if (dbName === DB_NAME && !db.objectStoreNames.contains(SHARES_STORE)) {
        db.createObjectStore(SHARES_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function playerDbName(shareId) {
  return `vsm-player-${shareId}`;
}

// ===== Library (audio files) =====

export async function saveToDb(name, arrayBuffer, dbName = DB_NAME) {
  const db = await openDb(dbName, dbName === DB_NAME ? DB_VERSION : PLAYER_DB_VERSION);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(LIBRARY_STORE);
    const req = store.add({ name, audioData: arrayBuffer });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllFromDb(dbName = DB_NAME) {
  const db = await openDb(dbName, dbName === DB_NAME ? DB_VERSION : PLAYER_DB_VERSION);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readonly');
    const store = tx.objectStore(LIBRARY_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIdsFromDb(ids, dbName = DB_NAME) {
  const db = await openDb(dbName, dbName === DB_NAME ? DB_VERSION : PLAYER_DB_VERSION);
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

export async function removeFromDb(id, dbName = DB_NAME) {
  const db = await openDb(dbName, dbName === DB_NAME ? DB_VERSION : PLAYER_DB_VERSION);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(LIBRARY_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ===== Presets =====

export async function savePreset(preset, dbName = DB_NAME) {
  const db = await openDb(dbName, dbName === DB_NAME ? DB_VERSION : PLAYER_DB_VERSION);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readwrite');
    const store = tx.objectStore(PRESETS_STORE);
    const req = store.put(preset); // put = upsert
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPresets(dbName = DB_NAME) {
  const db = await openDb(dbName, dbName === DB_NAME ? DB_VERSION : PLAYER_DB_VERSION);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readonly');
    const store = tx.objectStore(PRESETS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePreset(id, dbName = DB_NAME) {
  const db = await openDb(dbName, dbName === DB_NAME ? DB_VERSION : PLAYER_DB_VERSION);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRESETS_STORE, 'readwrite');
    const store = tx.objectStore(PRESETS_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ===== Shares (admin DB only) =====

export async function saveShare(share) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARES_STORE, 'readwrite');
    const store = tx.objectStore(SHARES_STORE);
    const req = store.put(share);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllShares() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARES_STORE, 'readonly');
    const store = tx.objectStore(SHARES_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getShareById(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARES_STORE, 'readonly');
    const store = tx.objectStore(SHARES_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteShareFromDb(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARES_STORE, 'readwrite');
    const store = tx.objectStore(SHARES_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPresetsByIds(ids) {
  const db = await openDb();
  const tx = db.transaction(PRESETS_STORE, 'readonly');
  const store = tx.objectStore(PRESETS_STORE);
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

// Save audio item with a specific ID (for inline share import)
export async function saveToDbWithId(id, name, arrayBuffer, dbName) {
  const db = await openDb(dbName, dbName === DB_NAME ? DB_VERSION : PLAYER_DB_VERSION);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(LIBRARY_STORE);
    const req = store.put({ id, name, audioData: arrayBuffer });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ===== Player DB functions =====

// Sync shared presets + audio from admin DB to player DB
export async function syncShareToPlayerDb(shareId, presets) {
  const pDbName = playerDbName(shareId);

  // Open player DB (creates if needed)
  await openDb(pDbName, PLAYER_DB_VERSION);

  // Copy presets with shared flag
  for (const preset of presets) {
    await savePreset({ ...preset, shared: true }, pDbName);
  }

  // Collect all audio IDs from all shared presets
  const audioIds = new Set();
  for (const preset of presets) {
    for (const dbId of (preset.libraryItemDbIds || [])) {
      audioIds.add(dbId);
    }
  }

  // Copy audio from admin DB to player DB
  if (audioIds.size > 0) {
    const adminAudio = await getByIdsFromDb([...audioIds]);
    const playerDb = await openDb(pDbName, PLAYER_DB_VERSION);
    const tx = playerDb.transaction(LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(LIBRARY_STORE);

    for (const item of adminAudio) {
      // Use put to upsert — keeps the same ID
      await new Promise((resolve, reject) => {
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  return pDbName;
}

// Get all presets from player DB
export async function getPlayerPresets(shareId) {
  return getAllPresets(playerDbName(shareId));
}

// Get the player DB name for a share
export { playerDbName };
