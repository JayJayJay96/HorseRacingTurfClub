import type { MusicTheme } from './chiptune.ts';

// Drop audio files into src/assets/music/<theme>/ (no code change); an empty folder keeps the chiptune.
const lobby = import.meta.glob<string>('../assets/music/lobby/*.{mp3,m4a,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});
const race = import.meta.glob<string>('../assets/music/race/*.{mp3,m4a,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const SONGS: Readonly<Record<MusicTheme, readonly string[]>> = {
  lobby: Object.values(lobby),
  race: Object.values(race),
};

// The race's crowd-and-hooves bed: the first file in src/assets/music/background/, looped.
const background = import.meta.glob<string>('../assets/music/background/*.{mp3,m4a,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const BEDS: Readonly<Partial<Record<MusicTheme, string>>> = {
  race: Object.values(background)[0],
};
