import { create } from 'zustand';

let nextLibraryId = 1;
let nextOrbId = 1;
let nextPresetId = 1;

// WTS-inspired color palette for orbs
const ORB_COLORS = [
  '#f5c518', // yellow
  '#e91e8c', // magenta
  '#2ecc71', // green
  '#3498db', // blue
  '#e67e22', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e74c3c', // red
  '#f39c12', // amber
  '#00bcd4', // cyan
];

let colorIndex = 0;
function getNextColor() {
  const color = ORB_COLORS[colorIndex % ORB_COLORS.length];
  colorIndex++;
  return color;
}

function createDefaultPreset(name = 'Preset 1') {
  return {
    id: nextPresetId++,
    name,
    bpm: 120,
    quantizeEnabled: true,
    reverbEnabled: false,
    reverbSendLevel: 0.5,
    reverbLpfFreq: 3500,
    filterEnabled: true,
    backgroundImage: null,
    libraryItemDbIds: [],
  };
}

const useSoundStore = create((set, get) => ({
  // Runtime state (not per-preset)
  libraryItems: [],
  orbs: [],
  globalMuted: false,

  // Presets
  presets: [createDefaultPreset()],
  activePresetId: 1,

  // ===== Helpers =====
  getActivePreset: () => {
    const state = get();
    return state.presets.find((p) => p.id === state.activePresetId);
  },

  // ===== Preset actions =====
  createPreset: (name) =>
    set((state) => {
      const preset = createDefaultPreset(name);
      return {
        presets: [...state.presets, preset],
        activePresetId: preset.id,
        libraryItems: [],
        orbs: [],
      };
    }),

  switchPreset: (id) =>
    set((state) => {
      if (state.activePresetId === id) return state;
      return {
        activePresetId: id,
        orbs: [], // clear all orbs
        libraryItems: [], // will be reloaded by Library component
      };
    }),

  renamePreset: (id, name) =>
    set((state) => ({
      presets: state.presets.map((p) =>
        p.id === id ? { ...p, name } : p
      ),
    })),

  deletePreset: (id) =>
    set((state) => {
      const remaining = state.presets.filter((p) => p.id !== id);
      if (remaining.length === 0) {
        const newPreset = createDefaultPreset('Preset 1');
        return {
          presets: [newPreset],
          activePresetId: newPreset.id,
          libraryItems: [],
          orbs: [],
        };
      }
      const newActiveId = state.activePresetId === id
        ? remaining[0].id
        : state.activePresetId;
      return {
        presets: remaining,
        activePresetId: newActiveId,
        ...(state.activePresetId === id ? { libraryItems: [], orbs: [] } : {}),
      };
    }),

  // Update active preset settings (partial)
  updateActivePreset: (updates) =>
    set((state) => ({
      presets: state.presets.map((p) =>
        p.id === state.activePresetId ? { ...p, ...updates } : p
      ),
    })),

  // Convenience actions that update active preset
  setBpm: (bpm) => {
    const val = Math.max(40, Math.min(240, Number(bpm) || 120));
    get().updateActivePreset({ bpm: val });
  },

  toggleQuantize: () => {
    const preset = get().getActivePreset();
    if (preset) get().updateActivePreset({ quantizeEnabled: !preset.quantizeEnabled });
  },

  toggleReverb: () => {
    const preset = get().getActivePreset();
    if (preset) get().updateActivePreset({ reverbEnabled: !preset.reverbEnabled });
  },

  setReverbSendLevel: (value) => {
    get().updateActivePreset({ reverbSendLevel: Math.max(0, Math.min(1, value)) });
  },

  setReverbLpfFreq: (value) => {
    get().updateActivePreset({ reverbLpfFreq: Math.max(200, Math.min(20000, value)) });
  },

  toggleFilter: () => {
    const preset = get().getActivePreset();
    if (preset) get().updateActivePreset({ filterEnabled: !preset.filterEnabled });
  },

  setBackgroundImage: (dataUrl) => {
    get().updateActivePreset({ backgroundImage: dataUrl });
  },

  removeBackgroundImage: () => {
    get().updateActivePreset({ backgroundImage: null });
  },

  // Add dbId to active preset's libraryItemDbIds
  addDbIdToPreset: (dbId) =>
    set((state) => ({
      presets: state.presets.map((p) =>
        p.id === state.activePresetId
          ? { ...p, libraryItemDbIds: [...p.libraryItemDbIds, dbId] }
          : p
      ),
    })),

  removeDbIdFromPreset: (dbId) =>
    set((state) => ({
      presets: state.presets.map((p) =>
        p.id === state.activePresetId
          ? { ...p, libraryItemDbIds: p.libraryItemDbIds.filter((id) => id !== dbId) }
          : p
      ),
    })),

  // Load presets from DB (called on init)
  loadPresets: (presets) =>
    set(() => {
      if (presets.length > 0) {
        // Update nextPresetId to avoid collisions
        const maxId = Math.max(...presets.map((p) => p.id));
        nextPresetId = maxId + 1;
        return {
          presets,
          activePresetId: presets[0].id,
        };
      }
      return {};
    }),

  // ===== Library actions =====
  addToLibrary: (name, audioBuffer, dbId = null) =>
    set((state) => ({
      libraryItems: [
        ...state.libraryItems,
        { id: nextLibraryId++, name, audioBuffer, dbId },
      ],
    })),

  removeFromLibrary: (id) =>
    set((state) => ({
      libraryItems: state.libraryItems.filter((item) => item.id !== id),
    })),

  clearLibrary: () => set({ libraryItems: [] }),

  // ===== Orb actions =====
  addOrb: (soundId, x, y) =>
    set((state) => {
      const libraryItem = state.libraryItems.find((item) => item.id === soundId);
      if (!libraryItem) return state;
      return {
        orbs: [
          ...state.orbs,
          {
            id: nextOrbId++,
            soundId,
            name: libraryItem.name,
            audioBuffer: libraryItem.audioBuffer,
            x,
            y,
            size: 100,
            muted: false,
            color: getNextColor(),
            waiting: false, // true when quantized start is pending
          },
        ],
      };
    }),

  updateOrb: (id, updates) =>
    set((state) => ({
      orbs: state.orbs.map((orb) =>
        orb.id === id ? { ...orb, ...updates } : orb
      ),
    })),

  toggleMute: (id) =>
    set((state) => ({
      orbs: state.orbs.map((orb) =>
        orb.id === id ? { ...orb, muted: !orb.muted } : orb
      ),
    })),

  toggleGlobalMute: () =>
    set((state) => ({ globalMuted: !state.globalMuted })),

  removeOrb: (id) =>
    set((state) => ({
      orbs: state.orbs.filter((orb) => orb.id !== id),
    })),

  clearOrbs: () => set({ orbs: [] }),
}));

export default useSoundStore;
