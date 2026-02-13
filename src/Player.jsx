import { useState, useEffect } from 'react';
import Library from './components/Library';
import MixerField from './components/MixerField';
import { getPlayerPresets, playerDbName, getByIdsFromDb, savePreset, saveToDbWithId } from './lib/audioDb';
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

  useEffect(() => {
    (async () => {
      try {
        const hash = window.location.hash;

        const match = hash.match(/^#share-(.+)$/);
        if (!match) {
          setError('Geen share gevonden. Open een share-link om te beginnen.');
          setLoading(false);
          return;
        }

        const sid = match[1];
        const baseUrl = `${import.meta.env.BASE_URL}shares/${sid}/`;

        // 1. Fetch meta.json
        const metaResponse = await fetch(`${baseUrl}meta.json`);
        if (!metaResponse.ok) {
          setError('Share niet gevonden. Controleer de link.');
          setLoading(false);
          return;
        }

        const meta = await metaResponse.json();

        setShare({
          name: meta.name,
          visibleControls: meta.visibleControls,
          showLibrary: meta.showLibrary,
          showOrbRemove: meta.showOrbRemove,
          presetIds: meta.presets.map((p) => p.id),
        });
        setShareId(sid);

        // 2. Write presets to player IDB
        const pDbName = playerDbName(sid);
        for (const preset of meta.presets) {
          await savePreset({ ...preset, shared: true }, pDbName);
        }

        // 3. Fetch audio files and write to player IDB
        const audioIds = new Set();
        for (const preset of meta.presets) {
          for (const dbId of preset.libraryItemDbIds || []) {
            audioIds.add(dbId);
          }
        }

        await Promise.all([...audioIds].map(async (id) => {
          const audioResponse = await fetch(`${baseUrl}${id}.bin`);
          if (!audioResponse.ok) {
            console.error(`Failed to fetch audio ${id}.bin`);
            return;
          }
          const arrayBuffer = await audioResponse.arrayBuffer();
          const name = meta.audioNames?.[String(id)] || `sound-${id}`;
          await saveToDbWithId(id, name, arrayBuffer, pDbName);
        }));

        // 4. Load presets + audio from player IDB
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
