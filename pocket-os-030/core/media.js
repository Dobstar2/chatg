export function sourceRectForEye(videoWidth, videoHeight, format, eyeIndex) {
  const width = Math.max(0, Number(videoWidth) || 0);
  const height = Math.max(0, Number(videoHeight) || 0);
  if (!format || format === '2d') return { sx: 0, sy: 0, sw: width, sh: height };
  const half = width / 2;
  if (format === 'sbs-lr') return { sx: eyeIndex === 0 ? 0 : half, sy: 0, sw: half, sh: height };
  if (format === 'sbs-rl') return { sx: eyeIndex === 0 ? half : 0, sy: 0, sw: half, sh: height };
  return { sx: 0, sy: 0, sw: width, sh: height };
}

export function displayAspect(videoWidth, videoHeight, format) {
  const w = Math.max(1, Number(videoWidth) || 16);
  const h = Math.max(1, Number(videoHeight) || 9);
  return Math.max(0.6, format?.startsWith('sbs') ? (w / 2) / h : w / h);
}

export function cycleCinemaFormat(format) {
  return format === '2d' ? 'sbs-lr' : format === 'sbs-lr' ? 'sbs-rl' : '2d';
}
