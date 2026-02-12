import { useRef, useEffect, useState } from 'react';
import useSoundStore from '../stores/useSoundStore';
import { useAudioEngine, exportAudioBufferAsWav } from '../hooks/useAudioEngine';
import { saveToDb, getByIdsFromDb, removeFromDb, getAllPresets, savePreset, deletePreset as deletePresetFromDb } from '../lib/audioDb';
import LibraryItem from './LibraryItem';

export default function Library() {
  const fileInputRef = useRef(null);
  const libraryItems = useSoundStore((s) => s.libraryItems);
  const addToLibrary = useSoundStore((s) => s.addToLibrary);
  const removeFromLibrary = useSoundStore((s) => s.removeFromLibrary);
  const clearLibrary = useSoundStore((s) => s.clearLibrary);
  const addDbIdToPreset = useSoundStore((s) => s.addDbIdToPreset);
  const removeDbIdFromPreset = useSoundStore((s) => s.removeDbIdFromPreset);

  // Presets
  const presets = useSoundStore((s) => s.presets);
  const activePresetId = useSoundStore((s) => s.activePresetId);
  const activePreset = presets.find((p) => p.id === activePresetId);
  const createPreset = useSoundStore((s) => s.createPreset);
  const switchPreset = useSoundStore((s) => s.switchPreset);
  const renamePreset = useSoundStore((s) => s.renamePreset);
  const deletePreset = useSoundStore((s) => s.deletePreset);
  const loadPresets = useSoundStore((s) => s.loadPresets);
  const setBackgroundImage = useSoundStore((s) => s.setBackgroundImage);
  const removeBackgroundImage = useSoundStore((s) => s.removeBackgroundImage);

  const { decodeAudio } = useAudioEngine();
  const bgInputRef = useRef(null);
  const [autoExport, setAutoExport] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const initRef = useRef(false);

  // Load presets from IndexedDB on mount, then load library for active preset
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        // Load presets
        const savedPresets = await getAllPresets();
        if (savedPresets.length > 0) {
          loadPresets(savedPresets);
          // Load library for first preset
          await loadLibraryForPreset(savedPresets[0]);
        }
      } catch (err) {
        console.error('Failed to init from IndexedDB:', err);
      }
    })();
  }, []);

  // When active preset changes, reload library
  const prevPresetIdRef = useRef(activePresetId);
  useEffect(() => {
    if (prevPresetIdRef.current === activePresetId) return;
    prevPresetIdRef.current = activePresetId;

    if (activePreset) {
      clearLibrary();
      loadLibraryForPreset(activePreset);
    }
  }, [activePresetId, activePreset, clearLibrary]);

  async function loadLibraryForPreset(preset) {
    if (!preset.libraryItemDbIds || preset.libraryItemDbIds.length === 0) return;
    try {
      const items = await getByIdsFromDb(preset.libraryItemDbIds);
      for (const item of items) {
        try {
          const audioBuffer = await decodeAudio(item.audioData);
          addToLibrary(item.name, audioBuffer, item.id);
        } catch (err) {
          console.error('Failed to restore audio:', item.name, err);
        }
      }
      console.log(`[Library] Loaded ${items.length} items for preset "${preset.name}"`);
    } catch (err) {
      console.error('Failed to load library for preset:', err);
    }
  }

  // Persist preset to IndexedDB whenever it changes
  useEffect(() => {
    if (activePreset) {
      savePreset(activePreset).catch(console.error);
    }
  }, [activePreset]);

  const handleFileImport = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const copyForDb = arrayBuffer.slice(0);
        const audioBuffer = await decodeAudio(arrayBuffer);
        const name = file.name.replace(/\.[^/.]+$/, '');

        const dbId = await saveToDb(name, copyForDb);
        addToLibrary(name, audioBuffer, dbId);
        addDbIdToPreset(dbId);

        if (autoExport) {
          exportAudioBufferAsWav(audioBuffer, `${name}_normalized_-30LUFS.wav`);
        }
      } catch (err) {
        console.error('Failed to decode audio file:', file.name, err);
      }
    }
    e.target.value = '';
  };

  const handleRemove = async (item) => {
    if (item.dbId) {
      try {
        await removeFromDb(item.dbId);
        removeDbIdFromPreset(item.dbId);
      } catch (err) {
        console.error('Failed to remove from DB:', err);
      }
    }
    removeFromLibrary(item.id);
  };

  const handleNewPreset = () => {
    const name = `Preset ${presets.length + 1}`;
    createPreset(name);
    // Save the new preset to DB
    setTimeout(() => {
      const state = useSoundStore.getState();
      const newPreset = state.presets.find((p) => p.id === state.activePresetId);
      if (newPreset) savePreset(newPreset).catch(console.error);
    }, 50);
  };

  const handlePresetSwitch = (e) => {
    const id = parseInt(e.target.value, 10);
    switchPreset(id);
  };

  const startEditName = () => {
    setNameInput(activePreset?.name || '');
    setEditingName(true);
  };

  const finishEditName = () => {
    if (nameInput.trim() && activePreset) {
      renamePreset(activePreset.id, nameInput.trim());
    }
    setEditingName(false);
  };

  const handleDeletePreset = async () => {
    if (presets.length <= 1) return;
    if (!confirm(`Preset "${activePreset?.name}" verwijderen?`)) return;
    const id = activePresetId;
    deletePreset(id);
    try {
      await deletePresetFromDb(id);
    } catch (err) {
      console.error('Failed to delete preset from DB:', err);
    }
  };

  const handleBackgroundUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setBackgroundImage(evt.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="library">
      <div className="library-header">
        <h2>Library</h2>
        <button
          className="add-button"
          onClick={() => fileInputRef.current?.click()}
        >
          + Add Sounds
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileImport}
          style={{ display: 'none' }}
        />
      </div>

      {/* Preset selector */}
      <div className="preset-selector">
        <select
          className="preset-dropdown"
          value={activePresetId}
          onChange={handlePresetSwitch}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {editingName ? (
          <input
            className="preset-name-input"
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={finishEditName}
            onKeyDown={(e) => e.key === 'Enter' && finishEditName()}
            autoFocus
          />
        ) : (
          <button className="preset-rename-btn" onClick={startEditName} title="Rename preset">
            ✏️
          </button>
        )}

        <button className="preset-new-btn" onClick={handleNewPreset} title="New preset">
          +
        </button>

        {presets.length > 1 && (
          <button className="preset-delete-btn" onClick={handleDeletePreset} title="Delete preset">
            ×
          </button>
        )}
      </div>

      {/* Background image upload */}
      <div className="bg-upload">
        {activePreset?.backgroundImage ? (
          <div className="bg-upload-preview">
            <img
              src={activePreset.backgroundImage}
              alt="Background"
              className="bg-thumbnail"
            />
            <button
              className="bg-remove-btn"
              onClick={removeBackgroundImage}
              title="Remove background"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            className="bg-upload-btn"
            onClick={() => bgInputRef.current?.click()}
          >
            + Background
          </button>
        )}
        <input
          ref={bgInputRef}
          type="file"
          accept="image/*"
          onChange={handleBackgroundUpload}
          style={{ display: 'none' }}
        />
      </div>

      <div className="library-export-toggle">
        <label>
          <input
            type="checkbox"
            checked={autoExport}
            onChange={(e) => setAutoExport(e.target.checked)}
          />
          Export WAV bij import
        </label>
      </div>

      <div className="library-list">
        {libraryItems.length === 0 && (
          <div className="library-empty">
            Import audio files to get started
          </div>
        )}
        {libraryItems.map((item) => (
          <LibraryItem
            key={item.id}
            item={item}
            onRemove={() => handleRemove(item)}
          />
        ))}
      </div>
    </div>
  );
}
