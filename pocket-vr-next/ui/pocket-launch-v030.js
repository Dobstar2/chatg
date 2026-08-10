const root = document.documentElement;
const statusCapsule = document.getElementById('launchStatusCapsule');
const permissionList = document.getElementById('permissionList');
const startStatus = document.getElementById('startStatus');
const buildLabel = document.getElementById('buildLabel');

const defaults = {
  theme: 'automatic',
  reduceTransparency: false,
  increaseContrast: false,
  reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
};

function readSetting(key) {
  try {
    const value = localStorage.getItem(`pocket:${key}`);
    return value == null ? defaults[key] : JSON.parse(value);
  } catch (_) {
    return defaults[key];
  }
}

function writeSetting(key, value) {
  try { localStorage.setItem(`pocket:${key}`, JSON.stringify(value)); } catch (_) {}
}

function applySettings() {
  const theme = readSetting('theme');
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  root.dataset.pocketTheme = theme === 'automatic' ? (prefersLight ? 'light' : 'dark') : theme;
  root.dataset.pocketReduceTransparency = String(Boolean(readSetting('reduceTransparency')));
  root.dataset.pocketContrast = String(Boolean(readSetting('increaseContrast')));
  root.dataset.pocketReduceMotion = String(Boolean(readSetting('reduceMotion')));

  document.querySelectorAll('[data-setting-toggle]').forEach((button) => {
    const key = button.dataset.settingToggle;
    button.setAttribute('aria-pressed', String(Boolean(readSetting(key))));
  });
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.themeOption === theme));
  });
}

function openSheet(sheet) {
  document.querySelectorAll('.pocket-sheet-backdrop').forEach((node) => node.classList.remove('open'));
  sheet?.classList.add('open');
}

function closeSheets() {
  document.querySelectorAll('.pocket-sheet-backdrop').forEach((node) => node.classList.remove('open'));
}

document.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open-sheet]');
  if (open) {
    openSheet(document.getElementById(open.dataset.openSheet));
    return;
  }
  if (event.target.closest('[data-close-sheet]') || event.target.classList.contains('pocket-sheet-backdrop')) {
    closeSheets();
    return;
  }
  const toggle = event.target.closest('[data-setting-toggle]');
  if (toggle) {
    const key = toggle.dataset.settingToggle;
    writeSetting(key, !Boolean(readSetting(key)));
    applySettings();
    return;
  }
  const theme = event.target.closest('[data-theme-option]');
  if (theme) {
    writeSetting('theme', theme.dataset.themeOption);
    applySettings();
  }
});

function setTextIfChanged(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

function normalizeTrackingCopy() {
  const hands = permissionList?.querySelector('[data-state="hands"]');
  if (hands) {
    const text = hands.textContent || '';
    if (/two-hand tracker ready|left \+ right/i.test(text)) {
      setTextIfChanged(hands, 'Automatic · one or two hands');
    } else if (/looking for left/i.test(text)) {
      setTextIfChanged(hands, 'Show either hand · second optional');
    } else if (/one hand detected/i.test(text)) {
      setTextIfChanged(hands, 'One hand ready · second optional');
    } else if (/two hands detected/i.test(text)) {
      setTextIfChanged(hands, 'Both hands ready');
    }
  }
  if (startStatus && /two-hand tracking/i.test(startStatus.textContent || '')) {
    setTextIfChanged(startStatus, 'Starting automatic hand tracking…');
  }
}

function updateStatus() {
  normalizeTrackingCopy();
  if (!statusCapsule) return;
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
  const camera = permissionList?.querySelector('[data-state="camera"]')?.textContent || 'Camera';
  const hands = permissionList?.querySelector('[data-state="hands"]')?.textContent || 'Hands';
  const active = /ready|automatic|detected|looking|show either/i.test(camera) || /ready|automatic|detected|looking|show either/i.test(hands);
  statusCapsule.innerHTML = `<span class="pocket-status-dot"></span><span>${time}</span><span>${active ? 'Ready' : 'Setup'}</span>`;
}

applySettings();
if (buildLabel) buildLabel.textContent = 'POCKET UI 0.3 · TRACKING 0.2';
root.dataset.pocketUi = '0.3';
normalizeTrackingCopy();
updateStatus();
setInterval(updateStatus, 15000);

if (permissionList) {
  new MutationObserver(updateStatus).observe(permissionList, { childList: true, subtree: true, characterData: true });
}
if (startStatus) {
  new MutationObserver(normalizeTrackingCopy).observe(startStatus, { childList: true, subtree: true, characterData: true });
}

window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
  if (readSetting('theme') === 'automatic') applySettings();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheets();
});

export { applySettings };
