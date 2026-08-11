const status = document.getElementById('bootStatus');
const progress = document.getElementById('bootProgress');
const retryButton = document.getElementById('bootRetry');
const TARGET = './recovery-direct-030.html?recovered=fix-e-bootstrap';

function setStatus(message, fraction = null) {
  if (status) status.textContent = message;
  if (progress && fraction != null) {
    const value = Math.max(0, Math.min(1, fraction));
    progress.style.setProperty('--progress', `${value * 100}%`);
    progress.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  }
}

async function clearPocketCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith('pocket-spatial-runtime-')).map((key) => caches.delete(key)));
}

async function recover() {
  retryButton?.setAttribute('hidden', '');
  setStatus('Removing the broken Pocket Spatial installer', 0.15);

  if (!('serviceWorker' in navigator)) {
    await clearPocketCaches();
    location.replace(TARGET);
    return;
  }

  let registration = await navigator.serviceWorker.getRegistration('./');
  if (!registration) {
    registration = await navigator.serviceWorker.register('./sw-v040.js?kill=1', {
      scope: './',
      updateViaCache: 'none',
    });
  }

  setStatus('Updating Safari recovery worker', 0.4);
  try { await registration.update(); } catch (_) {}

  setStatus('Clearing old Pocket runtime cache', 0.65);
  await clearPocketCaches();

  const startedAt = performance.now();
  while (performance.now() - startedAt < 8000) {
    const current = await navigator.serviceWorker.getRegistration('./');
    if (!current) break;
    try { await current.update(); } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  try {
    const current = await navigator.serviceWorker.getRegistration('./');
    if (current) await current.unregister();
  } catch (_) {}

  await clearPocketCaches();
  setStatus('Recovery complete', 1);
  location.replace(`${TARGET}&t=${Date.now()}`);
}

recover().catch((error) => {
  console.error(error);
  setStatus(error?.message || 'Recovery failed. Try again.', 0);
  retryButton?.removeAttribute('hidden');
});

retryButton?.addEventListener('click', () => location.reload());
