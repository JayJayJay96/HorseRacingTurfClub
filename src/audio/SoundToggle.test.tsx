import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './audioSettings.ts';
import { SoundToggle } from './SoundToggle.tsx';

const on = { ...DEFAULTS.phone, muted: false };

describe('SoundToggle', () => {
  it('icon-only keeps the accessible name', () => {
    const html = renderToStaticMarkup(<SoundToggle settings={on} update={() => {}} icon />);
    expect(html).toMatch(
      /<button type="button" class="icon" aria-label="Sound" aria-pressed="true">🔊<\/button>/,
    );
    const muted = renderToStaticMarkup(
      <SoundToggle settings={{ ...on, muted: true }} update={() => {}} icon />,
    );
    expect(muted).toMatch(/aria-pressed="false">🔇<\/button>/);
  });
  it('the default still reads "Sound"', () => {
    expect(renderToStaticMarkup(<SoundToggle settings={on} update={() => {}} />)).toMatch(
      /🔊(<!-- -->)? Sound<\/button>/,
    );
  });
});
