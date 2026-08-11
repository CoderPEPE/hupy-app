import {
  bytesToBase64,
  base64ToBytes,
  resample,
  rms,
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
} from './audioCodec';

describe('base64 roundtrip', () => {
  it('roundtrips arbitrary byte arrays', () => {
    for (const bytes of [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array([0, 0, 0, 0]),
      new Uint8Array([255, 254, 253, 252, 251]),
      new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256)),
    ]) {
      const encoded = bytesToBase64(bytes);
      const decoded = base64ToBytes(encoded);
      expect(decoded).toEqual(bytes);
    }
  });

  it('matches a known RFC 4648 vector', () => {
    expect(bytesToBase64(new TextEncoder().encode('Man'))).toBe('TWFu');
    expect(bytesToBase64(new TextEncoder().encode('Ma'))).toBe('TWE=');
    expect(bytesToBase64(new TextEncoder().encode('M'))).toBe('TQ==');
  });
});

describe('resample', () => {
  it('returns a copy when rates match', () => {
    const input = new Float32Array([0, 0.5, -0.5]);
    const out = resample(input, 48000, 48000);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('halves the length when downsampling 2x', () => {
    const input = new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]);
    const out = resample(input, 48000, 24000);
    expect(out.length).toBe(4);
  });

  it('doubles the length when upsampling 2x', () => {
    const input = new Float32Array([0, 1, 0, 1]);
    const out = resample(input, 24000, 48000);
    expect(out.length).toBe(8);
  });

  it('keeps values within input range (no blow-up)', () => {
    const input = new Float32Array(Array.from({ length: 100 }, (_, i) => Math.sin(i / 7)));
    const out = resample(input, 44100, 16000);
    expect(Math.max(...Array.from(out))).toBeLessThanOrEqual(1.0001);
    expect(Math.min(...Array.from(out))).toBeGreaterThanOrEqual(-1.0001);
  });
});

describe('PCM16 codec', () => {
  it('roundtrips Float32 samples', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.123, -0.999, 1, -1, 0.0001]);
    const pcm = float32ToPcm16Base64(samples);
    const back = pcm16Base64ToFloat32(pcm);
    expect(back.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i++) {
      // 16-bit quantization tolerance: 1/32768
      expect(Math.abs(back[i] - samples[i])).toBeLessThan(1 / 32768 + 1e-9);
    }
  });

  it('clamps out-of-range samples to the 16-bit limits', () => {
    const samples = new Float32Array([2, -2]);
    const pcm = float32ToPcm16Base64(samples);
    const back = pcm16Base64ToFloat32(pcm);
    // +1 maps to 0x7FFF (32767/32768), -1 maps to -0x8000 (-32768/32768)
    expect(back[0]).toBeCloseTo(32767 / 32768, 5);
    expect(back[1]).toBe(-1);
  });

  it('maps exact silence to zero', () => {
    const pcm = float32ToPcm16Base64(new Float32Array([0, 0]));
    const back = pcm16Base64ToFloat32(pcm);
    expect(back[0]).toBe(0);
    expect(back[1]).toBe(0);
  });

  it('is symmetric with bytesToBase64 for even byte counts', () => {
    const samples = new Float32Array([0.25, -0.75]);
    const pcm = float32ToPcm16Base64(samples);
    expect(base64ToBytes(pcm).length).toBe(samples.length * 2);
  });
});


describe('rms (echo-gate loudness estimate)', () => {
  it('is zero for silence and for an empty frame', () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(new Float32Array(128))).toBe(0);
  });

  it('is 1 for a full-scale constant signal', () => {
    const full = new Float32Array(64).fill(1);
    expect(rms(full)).toBeCloseTo(1, 6);
  });

  it('ranks a loud frame above a quiet one, which is what the gate relies on', () => {
    const quiet = new Float32Array(64).fill(0.01); // speaker echo
    const loud = new Float32Array(64).fill(0.4); // user talking over it
    expect(rms(loud)).toBeGreaterThan(rms(quiet));
  });

  it('ignores sign, so an oscillating waveform still reads as loud', () => {
    const wave = Float32Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 0.5 : -0.5));
    expect(rms(wave)).toBeCloseTo(0.5, 6);
  });
});
