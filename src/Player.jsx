import { useState, useEffect } from 'react';
import Library from './components/Library';
import MixerField from './components/MixerField';
import { getPlayerPresets, playerDbName, getByIdsFromDb, savePreset, saveToDbWithId } from './lib/audioDb';
import { base64ToArrayBuffer } from './lib/shareCodec';
import { useAudioEngine } from './hooks/useAudioEngine';
import useSoundStore from './stores/useSoundStore';
import './App.css';

export default function Player() {
  const [share, setShare] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPresets = useSoundStore((s) => s.loadPresets);
  const addToLibrary = useSoundStore((s) => s.addToLibrary);
  const { decodeAudio } = useAudioEngine();

  // Load payload into player IDB and Zustand store
  async function loadPayloadIntoPlayer(payload, sid) {
    const shareData = {
      name: payload.name,
      visibleControls: payload.visibleControls,
      showLibrary: payload.showLibrary,
      showOrbRemove: payload.showOrbRemove,
      presetIds: payload.presets.map((p) => p.id),
    };
    setShare(shareData);
    setShareId(sid);

    // Write presets + audio into a player-specific IDB
    const pDbName = playerDbName(sid);

    for (const preset of payload.presets) {
      await savePreset({ ...preset, shared: true }, pDbName);
    }

    for (const [idStr, audioEntry] of Object.entries(payload.audio)) {
      const arrayBuffer = base64ToArrayBuffer(audioEntry.data);
      await saveToDbWithId(Number(idStr), audioEntry.name, arrayBuffer, pDbName);
    }

    // Load from player IDB
    const playerPresets = await getPlayerPresets(sid);
    loadPresets(playerPresets);

    const firstPreset = playerPresets[0];
    if (firstPreset?.libraryItemDbIds?.length > 0) {
      const items = await getByIdsFromDb(firstPreset.libraryItemDbIds, pDbName);
      for (const item of items) {
        try {
          const audioBuffer = await decodeAudio(item.audioData);
          addToLibrary(item.name, audioBuffer, item.id);
        } catch (err) {
          console.error('Failed to decode audio:', item.name, err);
        }
      }
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const hash = window.location.hash;

        // ===== Share link: #share-<id> =====
        // Fetches the share JSON from /shares/{id}.json (served as static file)
        const match = hash.match(/^#share-(.+)$/);
        if (!match) {
          setError('Geen share gevonden. Open een share-link om te beginnen.');
          setLoading(false);
          return;
        }

        const sid = match[1];

        // Fetch the share JSON via HTTP
        const jsonUrl = `${import.meta.env.BASE_URL}shares/${sid}.json`;
        const response = await fetch(jsonUrl);

        if (!response.ok) {
          setError('Share niet gevonden. Controleer de link of vraag de admin om het JSON-bestand te deployen.');
          setLoading(false);
          return;
        }

        const payload = await response.json();

        await loadPayloadIntoPlayer(payload, sid);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load share:', err);
        setError('Fout bij het laden van de share.');
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="player-loading">
        <div className="player-loading-text">Laden...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="player-error">
        <div className="player-error-text">{error}</div>
      </div>
    );
  }

  return (
    <div className={`app player ${share?.showLibrary === false ? 'no-sidebar' : ''}`}>
      {share?.showLibrary !== false && (
        <Library mode="player" sharePresetIds={share?.presetIds} shareId={shareId} />
      )}
      <MixerField
        mode="player"
        visibleControls={share?.visibleControls}
        showOrbRemove={share?.showOrbRemove ?? true}
      />
    </div>
  );
}
