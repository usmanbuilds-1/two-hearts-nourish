import { Buffer } from "node:buffer";

/**
 * Verify the compressed browser JPEG before it can reach privileged storage.
 * Keep server uploads bounded even if a caller bypasses the normal photo picker.
 */
const PREFIX = "data:image/jpeg;base64,";
const MAX_DATA_URL = 3_000_000;
const MAX_BYTES = 2_250_000;

export function decodeMealJpeg(dataUrl: string): Uint8Array | null {
  if (dataUrl.length > MAX_DATA_URL || !dataUrl.startsWith(PREFIX)) return null;
  const encoded = dataUrl.slice(PREFIX.length);
  if (!encoded || encoded.length % 4 !== 0 ||
      !/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded)) return null;

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 4 || bytes.length > MAX_BYTES ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    return null;
  }
  return new Uint8Array(bytes);
}
