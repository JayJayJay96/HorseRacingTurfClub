const TEXT: Readonly<Record<string, string>> = {
  rain: '🌧️ Rain · horses may slip',
  fog: '🌫️ Fog · horses may bump',
};

/** Badge text for a race's weather; clear (or not rolled yet) shows nothing. */
export const weatherText = (weather: string | null | undefined): string | null =>
  (weather && TEXT[weather]) || null;

export function WeatherBadge({ weather }: { weather: string | null | undefined }) {
  const text = weatherText(weather);
  return text ? <p className="chip weather-badge">{text}</p> : null;
}
