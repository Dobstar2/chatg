const LABEL = 'HAND FIX 0.2.1 · CONTINUOUS';
const apply = () => {
  const build = document.getElementById('buildLabel');
  if (build && build.textContent !== LABEL) build.textContent = LABEL;
  document.documentElement.dataset.handFix = '021-continuous-reacquire';
};
apply();
setInterval(apply, 700);
