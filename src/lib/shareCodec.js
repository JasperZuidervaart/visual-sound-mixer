// Encode/decode self-contained share payloads for URL sharing
// Uses pako (gzip) compression + base64url encoding
import pako from 'pako';

// ===== Public API =====

// Encode share data object → compressed base64url string
export function encodeSharePayload(shareData) {
  const json = JSON.stringify(shareData);
  const compressed = pako.deflate(json);
  return uint8ToBase64url(compressed);
}

// Decode compressed base64url string → share data object
export function decodeSharePayload(encoded) {
  const compressed = base64urlToUint8(encoded);
  const json = pako.inflate(compressed, { to: 'string' });
  return JSON.parse(json);
}

// ArrayBuffer → base64 string (for audio data inside the payload)
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  // Process in chunks to avoid call stack overflow on large buffers
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(''));
}

// Base64 string → ArrayBuffer
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ===== Internal helpers =====

// Uint8Array → URL-safe base64 (no +, /, or = padding)
function uint8ToBase64url(uint8) {
  const chunks = [];
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const chunk = uint8.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// URL-safe base64 → Uint8Array
function base64urlToUint8(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
