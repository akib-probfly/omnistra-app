import * as FileSystem from 'expo-file-system/legacy';

function readU32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readI64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value |= BigInt(bytes[offset + index]) << BigInt(8 * index);
  }
  if (value >= 1n << 63n) {
    value -= 1n << 64n;
  }
  return value;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const lookup = new Uint8Array(256);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let index = 0; index < alphabet.length; index += 1) {
    lookup[alphabet.charCodeAt(index)] = index;
  }
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const output = new Uint8Array((clean.length * 3) / 4 - padding);
  let position = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const packed =
      (lookup[clean.charCodeAt(index)] << 18)
      | (lookup[clean.charCodeAt(index + 1)] << 12)
      | (lookup[clean.charCodeAt(index + 2)] << 6)
      | lookup[clean.charCodeAt(index + 3)];
    if (position < output.length) output[position++] = (packed >> 16) & 255;
    if (position < output.length) output[position++] = (packed >> 8) & 255;
    if (position < output.length) output[position++] = packed & 255;
  }
  return output;
}

function sniffExtension(bytes: Uint8Array): string {
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') return 'ogg';
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') return 'm4a';
  if (bytes.length >= 6 && ascii(bytes, 0, 6) === '#!AMR\n') return 'amr';
  if (bytes.length >= 9 && ascii(bytes, 0, 9) === '#!AMR-WB\n') return 'amr';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav';
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return 'mp3';
  return 'ogg';
}

function parseOggGranuleSeconds(bytes: Uint8Array): number | null {
  for (let offset = bytes.length - 27; offset >= 0; offset -= 1) {
    if (bytes[offset] !== 0x4f || bytes[offset + 1] !== 0x67 || bytes[offset + 2] !== 0x67 || bytes[offset + 3] !== 0x53) {
      continue;
    }
    const granule = readI64LE(bytes, offset + 6);
    if (granule <= 0n) continue;
    const seconds = Number(granule) / 48000;
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 3600) return seconds;
  }
  return null;
}

function opusFrameDurationMs(toc: number): number {
  const config = toc >> 3;
  const durations = [
    10, 20, 40, 60,
    10, 20, 40, 60,
    10, 20, 40, 60,
    10, 20, 40, 60,
    10, 20, 40, 60,
    2.5, 5, 10, 20,
    2.5, 5, 10, 20,
    2.5, 5, 10, 20,
    2.5, 5, 10, 20,
  ];
  const frameMs = durations[config] ?? 20;
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? 1 : 2;
  return frameMs * frames;
}

function parseOggOpusPacketSeconds(bytes: Uint8Array): number | null {
  let offset = 0;
  let totalMs = 0;
  let packets = 0;

  while (offset + 27 <= bytes.length) {
    if (bytes[offset] !== 0x4f || bytes[offset + 1] !== 0x67 || bytes[offset + 2] !== 0x67 || bytes[offset + 3] !== 0x53) {
      offset += 1;
      continue;
    }

    const segmentCount = bytes[offset + 26];
    if (offset + 27 + segmentCount > bytes.length) break;
    let bodySize = 0;
    const packetStarts: number[] = [];
    let packetSize = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      const lace = bytes[offset + 27 + index];
      if (packetSize === 0) packetStarts.push(bodySize);
      packetSize += lace;
      bodySize += lace;
      if (lace < 255) packetSize = 0;
    }

    const bodyStart = offset + 27 + segmentCount;
    for (const start of packetStarts) {
      const packetOffset = bodyStart + start;
      if (packetOffset >= bytes.length) break;
      const header = ascii(bytes, packetOffset, 8);
      if (header === 'OpusHead' || header === 'OpusTags') continue;
      totalMs += opusFrameDurationMs(bytes[packetOffset]);
      packets += 1;
    }
    offset = bodyStart + bodySize;
  }

  if (packets <= 0 || totalMs <= 0) return null;
  const seconds = totalMs / 1000;
  if (!Number.isFinite(seconds) || seconds > 3600) return null;
  return seconds;
}

function findAtom(bytes: Uint8Array, type: string, start: number, end: number): number | null {
  let offset = start;
  while (offset + 8 <= end && offset + 8 <= bytes.length) {
    const size = readU32BE(bytes, offset);
    if (size < 8) return null;
    if (ascii(bytes, offset + 4, 4) === type) return offset;
    offset += size;
  }
  return null;
}

function parseMp4Seconds(bytes: Uint8Array): number | null {
  const moovOffset = findAtom(bytes, 'moov', 0, bytes.length);
  if (moovOffset === null) return null;
  const moovSize = readU32BE(bytes, moovOffset);
  const mvhdOffset = findAtom(bytes, 'mvhd', moovOffset + 8, moovOffset + moovSize);
  if (mvhdOffset === null) return null;
  const version = bytes[mvhdOffset + 8];
  if (version === 0 && mvhdOffset + 28 <= bytes.length) {
    const timescale = readU32BE(bytes, mvhdOffset + 20);
    const duration = readU32BE(bytes, mvhdOffset + 24);
    return timescale > 0 ? duration / timescale : null;
  }
  if (version === 1 && mvhdOffset + 40 <= bytes.length) {
    const timescale = readU32BE(bytes, mvhdOffset + 28);
    const high = readU32BE(bytes, mvhdOffset + 32);
    const low = readU32BE(bytes, mvhdOffset + 36);
    const duration = high * 2 ** 32 + low;
    return timescale > 0 ? duration / timescale : null;
  }
  return null;
}

function parseAmrSeconds(bytes: Uint8Array): number | null {
  const narrow = ascii(bytes, 0, 6) === '#!AMR\n';
  const wide = ascii(bytes, 0, 9) === '#!AMR-WB\n';
  if (!narrow && !wide) return null;
  const sizes = wide
    ? [18, 24, 33, 37, 41, 47, 51, 59, 61, 6, 1, 1, 1, 1, 1, 1]
    : [13, 14, 16, 18, 20, 21, 27, 32, 6, 7, 6, 6, 1, 1, 1, 1];
  let offset = wide ? 9 : 6;
  let frames = 0;
  while (offset < bytes.length) {
    const frameType = (bytes[offset] >> 3) & 0x0f;
    const size = sizes[frameType];
    if (!size || offset + size > bytes.length) break;
    offset += size;
    frames += 1;
    if (frames > 100000) break;
  }
  return frames > 0 ? (frames * 20) / 1000 : null;
}

export function parseAudioDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 8) return null;
  const ogg = parseOggGranuleSeconds(bytes) ?? parseOggOpusPacketSeconds(bytes);
  if (ogg) return ogg;
  const mp4 = parseMp4Seconds(bytes);
  if (mp4 && mp4 > 0 && mp4 <= 3600) return mp4;
  const amr = parseAmrSeconds(bytes);
  if (amr && amr > 0 && amr <= 3600) return amr;
  return null;
}

export async function readLocalAudioMetadata(uri: string): Promise<{ durationSeconds: number | null; extension: string }> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = decodeBase64(base64);
  return {
    durationSeconds: parseAudioDurationSeconds(bytes),
    extension: sniffExtension(bytes),
  };
}
