import { useState, useEffect } from 'react';
import useSoundStore from '../stores/useSoundStore';
import { saveShare, getAllShares, deleteShareFromDb } from '../lib/audioDb';

const CONTROL_LABELS = {
  globalMute: 'Global Mute',
  reverbToggle: 'Reverb Toggle',
  reverbSendSlider: 'Reverb Send',
  reverbLpfSlider: 'Reverb LPF',
  filterToggle: 'Filter Toggle',
  quantizeToggle: 'Quantize Toggle',
  bpmControl: 'BPM Control',
};

export default function ShareManager() {
  const presets = useSoundStore((s) => s.presets);
  const shares = useSoundStore((s) => s.shares);
  const createShare = useSoundStore((s) => s.createShare);
  const updateShare = useSoundStore((s) => s.updateShare);
  const deleteShare = useSoundStore((s) => s.deleteShare);
  const loadShares = useSoundStore((s) => s.loadShares);

  const [isCreating, setIsCreating] = useState(false);
  const [editingShareId, setEditingShareId] = useState(null);
  const [name, setName] = useState('');
  const [selectedPresetIds, setSelectedPresetIds] = useState([]);
  const [visibleControls, setVisibleControls] = useState({
    globalMute: true,
    reverbToggle: true,
    reverbSendSlider: true,
    reverbLpfSlider: true,
    filterToggle: true,
    quantizeToggle: true,
    bpmControl: true,
  });
  const [showLibrary, setShowLibrary] = useState(true);
  const [showOrbRemove, setShowOrbRemove] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  // Load shares from IDB on mount
  useEffect(() => {
    getAllShares().then((saved) => {
      if (saved.length > 0) loadShares(saved);
    }).catch(console.error);
  }, []);

  // Persist shares to IDB
  useEffect(() => {
    // Save all shares whenever they change
    for (const share of shares) {
      saveShare(share).catch(console.error);
    }
  }, [shares]);

  const resetForm = () => {
    setName('');
    setSelectedPresetIds([]);
    setVisibleControls({
      globalMute: true,
      reverbToggle: true,
      reverbSendSlider: true,
      reverbLpfSlider: true,
      filterToggle: true,
      quantizeToggle: true,
      bpmControl: true,
    });
    setShowLibrary(true);
    setShowOrbRemove(true);
    setIsCreating(false);
    setEditingShareId(null);
  };

  const handleCreate = () => {
    if (!name.trim() || selectedPresetIds.length === 0) return;
    createShare(name.trim(), selectedPresetIds, { ...visibleControls }, showLibrary, showOrbRemove);
    resetForm();
  };

  const handleUpdate = () => {
    if (!editingShareId || !name.trim() || selectedPresetIds.length === 0) return;
    updateShare(editingShareId, {
      name: name.trim(),
      presetIds: selectedPresetIds,
      visibleControls: { ...visibleControls },
      showLibrary,
      showOrbRemove,
    });
    resetForm();
  };

  const handleEdit = (share) => {
    setEditingShareId(share.id);
    setName(share.name);
    setSelectedPresetIds([...share.presetIds]);
    setVisibleControls({ ...share.visibleControls });
    setShowLibrary(share.showLibrary ?? true);
    setShowOrbRemove(share.showOrbRemove ?? true);
    setIsCreating(true);
  };

  const handleDelete = async (shareId) => {
    if (!confirm('Share verwijderen?')) return;
    deleteShare(shareId);
    try {
      await deleteShareFromDb(shareId);
    } catch (err) {
      console.error('Failed to delete share from DB:', err);
    }
  };

  const togglePresetId = (id) => {
    setSelectedPresetIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleControl = (key) => {
    setVisibleControls((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getShareUrl = (shareId) => {
    const base = window.location.origin;
    return `${base}/#share-${shareId}`;
  };

  const copyShareUrl = (shareId) => {
    navigator.clipboard.writeText(getShareUrl(shareId)).then(() => {
      setCopiedId(shareId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="share-manager">
      <div className="share-manager-header">
        <h3>Shares</h3>
        {!isCreating && (
          <button className="share-new-btn" onClick={() => setIsCreating(true)}>
            + Share
          </button>
        )}
      </div>

      {/* Create / Edit form */}
      {isCreating && (
        <div className="share-form">
          <input
            className="share-name-input"
            type="text"
            placeholder="Share naam..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <div className="share-section">
            <label className="share-section-label">Presets</label>
            {presets.map((p) => (
              <label key={p.id} className="share-checkbox">
                <input
                  type="checkbox"
                  checked={selectedPresetIds.includes(p.id)}
                  onChange={() => togglePresetId(p.id)}
                />
                {p.name}
              </label>
            ))}
          </div>

          <div className="share-section">
            <label className="share-section-label">Zichtbare controls</label>
            {Object.entries(CONTROL_LABELS).map(([key, label]) => (
              <label key={key} className="share-checkbox">
                <input
                  type="checkbox"
                  checked={visibleControls[key]}
                  onChange={() => toggleControl(key)}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="share-section">
            <label className="share-section-label">Overig</label>
            <label className="share-checkbox">
              <input
                type="checkbox"
                checked={showLibrary}
                onChange={(e) => setShowLibrary(e.target.checked)}
              />
              Library sidebar
            </label>
            <label className="share-checkbox">
              <input
                type="checkbox"
                checked={showOrbRemove}
                onChange={(e) => setShowOrbRemove(e.target.checked)}
              />
              Orb verwijder-knop
            </label>
          </div>

          <div className="share-form-actions">
            {editingShareId ? (
              <button className="share-save-btn" onClick={handleUpdate}>Opslaan</button>
            ) : (
              <button className="share-save-btn" onClick={handleCreate}>Aanmaken</button>
            )}
            <button className="share-cancel-btn" onClick={resetForm}>Annuleren</button>
          </div>
        </div>
      )}

      {/* Existing shares list */}
      {shares.length > 0 && !isCreating && (
        <div className="share-list">
          {shares.map((share) => (
            <div key={share.id} className="share-item">
              <div className="share-item-info">
                <span className="share-item-name">{share.name}</span>
                <span className="share-item-meta">
                  {share.presetIds.length} preset{share.presetIds.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="share-item-actions">
                <button
                  className="share-copy-btn"
                  onClick={() => copyShareUrl(share.id)}
                  title="Kopieer link"
                >
                  {copiedId === share.id ? '✓' : '🔗'}
                </button>
                <button
                  className="share-edit-btn"
                  onClick={() => handleEdit(share)}
                  title="Bewerk"
                >
                  ✏️
                </button>
                <button
                  className="share-delete-btn"
                  onClick={() => handleDelete(share.id)}
                  title="Verwijder"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
