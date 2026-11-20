import React, { useEffect, useState } from 'react';
import type { CameraFeed, CameraZones } from '../domain';
import { cameraService, exportService } from '../services';
import { Modal } from './UIComponents';
import ZoneEditor from './ZoneEditor';

interface Props {
  feed: CameraFeed | null;
  onClose: () => void;
  onSaved: (feed: CameraFeed) => void;
}

const inputClass =
  'w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-red-500/10 focus:bg-white focus:border-red-300 text-sm';

/** Device configuration: rename a camera and set its red/yellow detection zones. */
const DeviceConfigModal: React.FC<Props> = ({ feed, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [zones, setZones] = useState<CameraZones>(cameraService.DEFAULT_ZONES);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!feed) return;
    setName(feed.name);
    setLocation(feed.location);
    setZones(feed.zones ?? cameraService.DEFAULT_ZONES);
    setNote(null);
  }, [feed]);

  if (!feed) return null;

  const save = () => {
    const saved = cameraService.saveCameraConfig(feed.id, { name, location, zones });
    onSaved(saved);
    onClose();
  };

  const reset = () => {
    setZones(cameraService.DEFAULT_ZONES);
    setNote('Zones reset to the defaults. Save to keep them.');
  };

  const download = async () => {
    const data = cameraService.zonesExport({ ...feed, name, zones });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const r = await exportService.downloadBlob(blob, `zones_${feed.id}.json`);
    setNote(r === 'saved' ? `Saved zones_${feed.id}.json` : 'Zone file not saved');
  };

  return (
    <Modal isOpen onClose={onClose} title={`Device configuration · ${feed.id}`} size="xl">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="cam-name" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mono">
              Camera name
            </label>
            <input id="cam-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cam-location" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mono">
              Terminal / location
            </label>
            <input id="cam-location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
          </div>
        </div>

        <ZoneEditor feed={feed} zones={zones} onChange={setZones} />

        <p className="text-xs bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-600">
          These zones are the settings the edge device uses for this camera: a person inside the red zone raises an intrusion alert, inside
          the yellow zone a warning. The recorded demo clips keep the zones they were recorded with; export the zone file to run the model
          with your new zones.
        </p>

        {note && (
          <p role="status" className="text-xs font-semibold text-zinc-700">
            {note}
          </p>
        )}

        <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-zinc-100">
          <div className="flex flex-wrap gap-3">
            <button onClick={reset} className="px-5 py-3 rounded-2xl border border-zinc-200 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50">
              Reset zones
            </button>
            <button onClick={download} className="px-5 py-3 rounded-2xl border border-zinc-200 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50">
              Export zone file
            </button>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-3 rounded-2xl border border-zinc-200 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50">
              Cancel
            </button>
            <button onClick={save} className="px-6 py-3 rounded-2xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700">
              Save configuration
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DeviceConfigModal;
