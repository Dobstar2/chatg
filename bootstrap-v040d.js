// Pocket Spatial 0.4 Safari Fix D
// Safari's native atob() has rejected the staged release on some devices even
// after the input was reduced to valid base64 characters. Install a tiny,
// deterministic decoder before loading the release bootstrap so the installer
// no longer depends on WebKit's atob implementation.

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
  BASE64_LOOKUP[BASE64_ALPHABET.charCodeAt(i)] = i;
}

function pocketAtob(input) {
  const text = String(input ?? '');
  const bytes = [];
  let accumulator = 0;
  let bitCount = 0;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const char = text[i];

    // Padding carries no data. The surrounding bootstrap already validates
    // payload integrity with SHA-256, so ignoring padding here is safe.
    if (char === '=') continue;
    if (code === 9 || code === 10 || code === 13 || code === 32) continue;
    if (code >= BASE64_LOOKUP.length || BASE64_LOOKUP[code] < 0) {
      throw new Error(`Pocket base64 decoder rejected character U+${code.toString(16).toUpperCase().padStart(4, '0')}.`);
    }

    accumulator = (accumulator << 6) | BASE64_LOOKUP[code];
    bitCount += 6;

    while (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((accumulator >> bitCount) & 0xff);
      // Keep the accumulator bounded and avoid signed 32-bit overflow over
      // long strings. Only the unconsumed low bits are needed.
      accumulator &= bitCount ? (1 << bitCount) - 1 : 0;
    }
  }

  // A legal base64 tail may leave 0, 2 or 4 useful bits. Six leftover bits
  // means the source length was impossible (one data character modulo four).
  if (bitCount === 6) throw new Error('Pocket base64 data has an impossible trailing length.');

  const CHUNK = 8192;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + CHUNK));
  }
  return binary;
}

try {
  Object.defineProperty(globalThis, 'atob', {
    configurable: true,
    writable: true,
    value: pocketAtob,
  });
} catch (_) {
  // Fallback for WebKit builds that make the global property non-configurable.
  try { globalThis.atob = pocketAtob; } catch (_) {}
}

await import('./bootstrap-v040b.js?rev=safari-fix-d-no-native-atob');
