import { useState } from 'react';
import type { AudioSettings } from './audioSettings.ts';

type Props = {
  settings: AudioSettings;
  update: (patch: Partial<AudioSettings>) => void;
  /** Phones only get on/off; the big screen also gets volumes and the commentator. */
  full?: boolean;
};

/** 🔊/🔇 plus an optional volume panel. Clicking it also unlocks browser audio. */
export function SoundToggle({ settings, update, full = false }: Props) {
  const [open, setOpen] = useState(false);
  const slider = (label: string, key: 'music' | 'sfx' | 'voice') => (
    <label>
      {label}{' '}
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={settings[key]}
        onChange={(e) => update({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div className="sound">
      <button
        type="button"
        aria-label="Sound"
        aria-pressed={!settings.muted}
        onClick={() => update({ muted: !settings.muted })}
      >
        {settings.muted ? '🔇 Sound' : '🔊 Sound'}
      </button>
      {full && (
        <>
          {' '}
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Volume
          </button>
          {open && (
            <div className="sound-panel">
              {slider('Music', 'music')}
              {slider('Effects', 'sfx')}
              {slider('Commentator', 'voice')}
              <label htmlFor="commentator-on">
                <input
                  id="commentator-on"
                  type="checkbox"
                  checked={settings.commentator}
                  onChange={(e) => update({ commentator: e.target.checked })}
                />{' '}
                Commentator on
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
