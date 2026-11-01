import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupPlusCode } from './geocode';
import { decodePlusCode, encodePlusCode, isFullPlusCode, isShortPlusCode, isValidPlusCode, parsePlusCodeInput, recoverPlusCode } from './pluscode';

describe('Plus Code', () => {
  it('encodes and decodes like the reference implementation', () => {
    expect(encodePlusCode(47.36559, 8.524997)).toBe('8FVC9G8F+6X');
    expect(encodePlusCode(47.36559, 8.524997, 11)).toBe('8FVC9G8F+6XQ');
    expect(encodePlusCode(47.36559, 8.524997, 4)).toBe('8FVC0000+');
    const a = decodePlusCode('8FVC9G8F+6X');
    expect(a.lat).toBeCloseTo(47.3655625, 7);
    expect(a.lng).toBeCloseTo(8.5249375, 7);
    expect(a.latSize).toBeCloseTo(0.000125, 9);
  });

  it('round-trips a location within the code area', () => {
    const code = encodePlusCode(34.9949, 135.785); // 清水寺
    const a = decodePlusCode(code);
    expect(Math.abs(a.lat - 34.9949)).toBeLessThan(a.latSize);
    expect(Math.abs(a.lng - 135.785)).toBeLessThan(a.lngSize);
    expect(encodePlusCode(a.lat, a.lng)).toBe(code);
  });

  it('validates full and short codes', () => {
    expect(isFullPlusCode('8fvc9g8f+6x')).toBe(true);
    expect(isShortPlusCode('9G8F+6X')).toBe(true);
    expect(isValidPlusCode('8FVC0000+')).toBe(true);
    for (const bad of ['8FVC9G8F6X', '8FVC9G8F+6', '8FV00000+', '8FVC0000+XX', '+XX', '9G8F+6A']) expect(isValidPlusCode(bad)).toBe(false);
    expect(isFullPlusCode('WC2345G6+')).toBe(false); // 緯度の範囲外
  });

  it('recovers a short code to the nearest full code', () => {
    expect(recoverPlusCode('9G8F+6X', 47.4, 8.6)).toBe('8FVC9G8F+6X');
    expect(recoverPlusCode('8F+6X', 47.37, 8.53)).toBe('8FVC9G8F+6X');
    // 基準点がセルの境界をまたいでも近い方を選ぶ
    const code = encodePlusCode(34.9949, 135.785);
    expect(recoverPlusCode(code.slice(4), 35.3, 135.4)).toBe(code);
    expect(recoverPlusCode(code.slice(4), 34.6, 136.2)).toBe(code);
  });

  it('extracts a Plus Code and locality from input text', () => {
    expect(parsePlusCodeInput('MP2R+XX 京都市')).toEqual({ code: 'MP2R+XX', locality: '京都市', full: false });
    expect(parsePlusCodeInput('mp2r+xx, Kyoto, Japan')).toEqual({ code: 'MP2R+XX', locality: 'Kyoto, Japan', full: false });
    expect(parsePlusCodeInput('8Q6QMP2R+XX')).toEqual({ code: '8Q6QMP2R+XX', locality: '', full: true });
    expect(parsePlusCodeInput('FVC2+RM 串本町、和歌山県')).toEqual({ code: 'FVC2+RM', locality: '串本町、和歌山県', full: false });
    expect(parsePlusCodeInput('ＦＶＣ２＋ＲＭ　串本町')).toEqual({ code: 'FVC2+RM', locality: '串本町', full: false });
    expect(parsePlusCodeInput('清水寺')).toBeNull();
    expect(parsePlusCodeInput('C++ 勉強会')).toBeNull();
  });
});

describe('lookupPlusCode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null for ordinary place names without calling the network', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await lookupPlusCode('清水寺')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('decodes a full code even when reverse geocoding fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await lookupPlusCode('8FVC9G8F+6X');
    expect(r).toMatchObject({ name: '8FVC9G8F+6X', plusCode: '8FVC9G8F+6X' });
    expect(r!.lat).toBeCloseTo(47.3655625, 6);
  });

  it('uses the nearby point for a short code without a locality, and asks for one otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await lookupPlusCode('9G8F+6X', { lat: 47.4, lng: 8.6 }))?.plusCode).toBe('8FVC9G8F+6X');
    await expect(lookupPlusCode('9G8F+6X')).rejects.toThrow('地名と一緒に');
  });

  it('recovers a short code near the searched locality', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/search')
          ? new Response(JSON.stringify([{ name: '串本町', display_name: '串本町, 東牟婁郡, 和歌山県, 日本', lat: '33.4857631', lon: '135.7869892' }]))
          : new Response(JSON.stringify({ name: '樫野', display_name: '樫野, 串本町, 東牟婁郡, 和歌山県, 日本' })),
      ),
    );
    const r = await lookupPlusCode('FVC2+RM 串本町、和歌山県', { lat: 35.0, lng: 135.7 });
    expect(r).toMatchObject({ name: '樫野', plusCode: '8Q5QFVC2+RM' });
    expect(r!.lat).toBeCloseTo(33.4721, 4);
    expect(r!.lng).toBeCloseTo(135.8517, 4);
  });
});
