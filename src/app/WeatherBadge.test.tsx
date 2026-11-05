import { describe, expect, it } from 'vitest';
import { weatherText } from './WeatherBadge.tsx';

describe('weatherText', () => {
  it('says nothing on a clear day and explains rain and fog', () => {
    expect(weatherText('clear')).toBeNull();
    expect(weatherText(undefined)).toBeNull();
    expect(weatherText(null)).toBeNull();
    expect(weatherText('rain')).toBe('🌧️ Rain · horses may slip');
    expect(weatherText('fog')).toBe('🌫️ Fog · horses may bump');
  });
});
