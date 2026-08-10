const RELEASE = 'pocket-spatial-0.4.0';
const PAYLOAD_COMMIT = 'a81268c8624acdf778ce1c1683e7f448e795b1c1';
const PAYLOAD_SHA256 = 'c6d99a37edf4652962f4f96049e5bc565f3d9c3d950de7b6ce8f06df60f97ae1';
const PART_COUNT = 7;
const RAW_BASE = `https://raw.githubusercontent.com/Dobstar2/chatg/${PAYLOAD_COMMIT}/.pocket-upload`;
const status = document.getElementById('bootStatus');
const progress = document.getElementById('bootProgress');
const retryButton = document.getElementById('bootRetry');

function setStatus(message, fraction = null) {
  if (status) status.textContent = message;
  if (progress && fraction != null) {
    progress.style.setProperty('--progress', `${Math.max(0, Math.min(1, fraction)) * 100}%`);
    progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This Safari version does not expose the browser decompression API required by this release.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readString(bytes, start, length) {
  let end = start;
  const limit = Math.min(bytes.length, start + length);
  while (end < limit && bytes[end] !== 0) end += 1;
  return new TextDecoder().decode(bytes.subarray(start, end)).trim();
}

function parseTar(bytes) {
  const files = [];
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const path = `${prefix ? `${prefix}/` : ''}${name}`.replace(/^\.\//, '');
    const sizeText = readString(header, 124, 12).replace(/\0/g, '').trim();
    const size = Number.parseInt(sizeText || '0', 8) || 0;
    const type = String.fromCharCode(header[156] || 48);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > bytes.length) throw new Error(`Release archive ended early while reading ${path}.`);
    if (path && type !== '5') files.push({ path, bytes: bytes.slice(bodyStart, bodyEnd).buffer });
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

function waitForController(timeoutMs = 8000) {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

async function askWorker(worker, message, transfer = []) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => reject(new Error('Pocket runtime installation timed out.')), 20000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      const data = event.data || {};
      if (data.ok) resolve(data);
      else reject(new Error(data.message || 'Pocket runtime installation failed.'));
    };
    worker.postMessage(message, [channel.port2, ...transfer]);
  });
}

async function fetchPayload() {
  const parts = [];
  for (let index = 0; index < PART_COUNT; index += 1) {
    setStatus(`Downloading spatial runtime ${index + 1} of ${PART_COUNT}`, 0.08 + index / PART_COUNT * 0.42);
    const name = `part-${String(index).padStart(2, '0')}`;
    const response = await fetch(`${RAW_BASE}/${name}`, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error(`Could not download ${name} (${response.status}).`);
    parts.push(await response.text());
  }
  return base64ToBytes(parts.join(''));
}

async function installRelease(registration) {
  const compressed = await fetchPayload();
  setStatus('Checking release integrity', 0.54);
  const digest = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', compressed)));
  if (digest !== PAYLOAD_SHA256) throw new Error('The downloaded Pocket runtime did not pass its integrity check.');

  setStatus('Preparing spatial systems', 0.62);
  const archive = await gunzip(compressed);
  const files = parseTar(archive).filter((file) => (
    file.path === 'index.html'
    || file.path === 'manifest.webmanifest'
    || file.path.startsWith('pocket-vr-next/v040/')
  ));
  if (!files.some((file) => file.path === 'pocket-vr-next/v040/app.js')) {
    throw new Error('The release archive is missing the Pocket runtime entry point.');
  }

  setStatus('Installing the spatial runtime', 0.78);
  const worker = registration.active || registration.waiting || registration.installing;
  if (!worker) throw new Error('The Pocket service worker is not active.');
  const transfers = files.map((file) => file.bytes);
  await askWorker(worker, { type: 'INSTALL_RELEASE', release: RELEASE, files }, transfers);
  localStorage.setItem('pocketSpatialRelease', RELEASE);
  setStatus('Pocket Spatial is ready', 1);
}

async function boot() {
  retryButton?.setAttribute('hidden', '');
  if (!('serviceWorker' in navigator) || !('caches' in window) || !globalThis.crypto?.subtle) {
    throw new Error('This browser is missing a required offline/runtime capability.');
  }

  setStatus('Checking Pocket Spatial', 0.04);
  const registration = await navigator.serviceWorker.register('./sw-v040.js', { scope: './', updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  await waitForController();
  if (!navigator.serviceWorker.controller) {
    if (sessionStorage.getItem('pocketSpatialSwReload') === RELEASE) {
      throw new Error('Safari installed the runtime worker but did not attach it to this page. Close this tab and open Pocket Spatial again.');
    }
    sessionStorage.setItem('pocketSpatialSwReload', RELEASE);
    location.reload();
    return;
  }
  sessionStorage.removeItem('pocketSpatialSwReload');

  const worker = registration.active || navigator.serviceWorker.controller;
  let installed = false;
  if (worker) {
    try {
      const result = await askWorker(worker, { type: 'GET_RELEASE' });
      installed = result.release === RELEASE;
    } catch (_) {}
  }

  if (!installed) await installRelease(registration);
  else setStatus('Pocket Spatial is ready', 1);

  const target = new URL(location.href);
  target.searchParams.set('runtime', '040');
  target.searchParams.set('release', RELEASE);
  location.replace(target.href);
}

boot().catch((error) => {
  console.error(error);
  setStatus(error?.message || 'Pocket Spatial could not start.', 0);
  retryButton?.removeAttribute('hidden');
});

retryButton?.addEventListener('click', () => location.reload());
