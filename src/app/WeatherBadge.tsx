const TEXT: Readonly<Record<string, readonly [icon: string, label: string]>> = {
  rain: ['🌧️', 'Rain · horses may slip'],
  fog: ['🌫️', 'Fog · horses may bump'],
};

/** Badge text for a race's weather; clear (or not rolled yet) shows nothing. */
export const weatherText = (weather: string | null | undefined): string | null => {
  const entry = weather ? TEXT[weather] : undefined;
  return entry ? `${entry[0]} ${entry[1]}` : null;
};

export function WeatherBadge({ weather }: { weather: string | null | undefined }) {
  const entry = weather ? TEXT[weather] : undefined;
  if (!entry) return null;
  // The icon is decoration; screen readers get the words only.
  return (
    <p className="chip weather-badge">
      <span aria-hidden="true">{entry[0]}</span> {entry[1]}
    </p>
  );
}
