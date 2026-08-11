const LABEL = 'HAND FIX 0.2.2 · SAFARI TIMER';
function stamp() {
  const node = document.getElementById('buildLabel');
  if (node) node.textContent = LABEL;
  document.documentElement.dataset.handFix = '0.2.2';
}
stamp();
setInterval(stamp, 300);
