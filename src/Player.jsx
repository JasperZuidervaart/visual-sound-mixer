import { useState, useEffect } from 'react';
import Library from './components/Library';
import MixerField from './components/MixerField';
import { getShareById, getPresetsByIds, syncShareToPlayerDb, getPlayerPresets, playerDbName, getByIdsFromDb, savePreset, saveToDbWithId } from './lib/audioDb';
import { decodeSharePayload, base64ToArrayBuffer } from './lib/shareCodec';
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

        // ===== Self-contained share link: #s=<compressed payload> =====
        if (hash.startsWith('#s=')) {
          const encoded = hash.slice(3);
          const payload = decodeSharePayload(encoded);

          const shareData = {
            name: payload.name,
            visibleControls: payload.visibleControls,
            showLibrary: payload.showLibrary,
            showOrbRemove: payload.showOrbRemove,
            presetIds: payload.presets.map((p) => p.id),
          };
          setShare(shareData);

          const sid = 'inline-' + Date.now();
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

          // Load from player IDB (same flow as legacy shares)
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
          return;
        }

        // ===== Legacy share link: #share-<id> (same browser only) =====
        const match = hash.match(/^#share-(.+)$/);
        if (!match) {
          setError('Geen share gevonden. Open een share-link om te beginnen.');
          setLoading(false);
          return;
        }

        const sid = match[1];
        setShareId(sid);

        // 1. Read share config from admin DB
        const shareData = await getShareById(sid);
        if (!shareData) {
          setError('Share niet gevonden. Controleer de link.');
          setLoading(false);
          return;
        }
        setShare(shareData);

        // 2. Read shared presets from admin DB
        const adminPresets = await getPresetsByIds(shareData.presetIds);
        if (adminPresets.length === 0) {
          setError('Geen presets gevonden voor deze share.');
          setLoading(false);
          return;
        }

        // 3. Sync shared presets + audio to player-specific IDB
        const pDbName = await syncShareToPlayerDb(sid, adminPresets);

        // 4. Load ALL presets from player DB (shared + user-created)
        const playerPresets = await getPlayerPresets(sid);
        loadPresets(playerPresets);

        // 5. Load audio library for the first preset from player DB
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
