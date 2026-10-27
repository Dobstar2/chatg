function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function appIdFromTarget(target) {
  const id = String(target?.id || '');
  if (id.startsWith('app:')) return id.slice(4);
  if (id.startsWith('switcher:focus:')) return id.slice('switcher:focus:'.length);
  if (id.startsWith('window:focus:')) return id.slice('window:focus:'.length);
  return id;
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawAppIcon(ctx, id, x, y, size, active) {
  const r = size * 0.23;
  const stroke = active ? '#ffffff' : 'rgba(226,241,255,.92)';
  const soft = active ? 'rgba(180,224,255,.28)' : 'rgba(126,178,240,.14)';
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = soft;
  ctx.lineWidth = Math.max(1.4, size * 0.018);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
  ctx.fill();

  switch (id) {
    case 'home':
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, r * 0.05);
      ctx.lineTo(0, -r * 0.55);
      ctx.lineTo(r * 0.62, r * 0.05);
      ctx.stroke();
      roundRect(ctx, -r * 0.43, -r * 0.02, r * 0.86, r * 0.62, r * 0.08);
      ctx.stroke();
      line(ctx, -r * 0.1, r * 0.6, -r * 0.1, r * 0.23);
      line(ctx, r * 0.1, r * 0.6, r * 0.1, r * 0.23);
      break;
    case 'library':
      for (const dx of [-0.38, 0.12])
        for (const dy of [-0.38, 0.12]) {
          roundRect(ctx, r * dx, r * dy, r * 0.28, r * 0.28, r * 0.05);
          ctx.stroke();
        }
      break;
    case 'cinema':
      roundRect(ctx, -r * 0.65, -r * 0.42, r * 1.3, r * 0.84, r * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, -r * 0.22);
      ctx.lineTo(r * 0.3, 0);
      ctx.lineTo(-r * 0.12, r * 0.22);
      ctx.closePath();
      ctx.fillStyle = stroke;
      ctx.fill();
      break;
    case 'planetarium':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.72, r * 0.28, -0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.52, -r * 0.16, r * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      break;
    case 'portal':
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.48, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.28, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'hologram':
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.6);
      ctx.lineTo(r * 0.52, -r * 0.28);
      ctx.lineTo(r * 0.52, r * 0.32);
      ctx.lineTo(0, r * 0.62);
      ctx.lineTo(-r * 0.52, r * 0.32);
      ctx.lineTo(-r * 0.52, -r * 0.28);
      ctx.closePath();
      ctx.stroke();
      line(ctx, 0, -r * 0.6, 0, 0);
      line(ctx, -r * 0.52, -r * 0.28, 0, 0);
      line(ctx, r * 0.52, -r * 0.28, 0, 0);
      line(ctx, 0, 0, 0, r * 0.62);
      break;
    case 'arcade':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      break;
    case 'music':
      line(ctx, r * 0.08, -r * 0.5, r * 0.08, r * 0.35);
      line(ctx, r * 0.08, -r * 0.5, r * 0.48, -r * 0.38);
      line(ctx, r * 0.48, -r * 0.38, r * 0.48, r * 0.2);
      ctx.beginPath();
      ctx.arc(-r * 0.08, r * 0.42, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(r * 0.32, r * 0.27, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mini-worlds':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.48, r * 0.14);
      ctx.quadraticCurveTo(-r * 0.2, -r * 0.18, 0, r * 0.06);
      ctx.quadraticCurveTo(r * 0.25, r * 0.3, r * 0.5, -r * 0.04);
      ctx.stroke();
      line(ctx, -r * 0.7, r * 0.58, r * 0.7, r * 0.58);
      break;
    case 'passthrough':
      roundRect(ctx, -r * 0.62, -r * 0.38, r * 1.24, r * 0.76, r * 0.13);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      roundRect(ctx, -r * 0.28, -r * 0.56, r * 0.56, r * 0.16, r * 0.05);
      ctx.stroke();
      break;
    case 'gallery':
      roundRect(ctx, -r * 0.62, -r * 0.48, r * 1.24, r * 0.96, r * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.28, -r * 0.2, r * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.48, r * 0.3);
      ctx.lineTo(-r * 0.12, -r * 0.04);
      ctx.lineTo(r * 0.08, r * 0.16);
      ctx.lineTo(r * 0.28, -r * 0.04);
      ctx.lineTo(r * 0.5, r * 0.3);
      ctx.stroke();
      break;
    case 'browser':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.24, r * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
      line(ctx, -r * 0.54, 0, r * 0.54, 0);
      line(ctx, -r * 0.42, -r * 0.3, r * 0.42, -r * 0.3);
      line(ctx, -r * 0.42, r * 0.3, r * 0.42, r * 0.3);
      break;
    case 'clock':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      line(ctx, 0, 0, 0, -r * 0.34);
      line(ctx, 0, 0, r * 0.28, r * 0.18);
      break;
    case 'settings':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          ctx,
          Math.cos(a) * r * 0.36,
          Math.sin(a) * r * 0.36,
          Math.cos(a) * r * 0.58,
          Math.sin(a) * r * 0.58,
        );
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'system-info':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.28, r * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      line(ctx, 0, -r * 0.06, 0, r * 0.34);
      break;
    case 'tracking-lab':
      line(ctx, -r * 0.55, 0, r * 0.55, 0);
      line(ctx, 0, -r * 0.55, 0, r * 0.55);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      break;
    case 'labs':
      line(ctx, -r * 0.18, -r * 0.58, -r * 0.18, -r * 0.12);
      line(ctx, r * 0.18, -r * 0.58, r * 0.18, -r * 0.12);
      line(ctx, -r * 0.28, -r * 0.58, r * 0.28, -r * 0.58);
      ctx.beginPath();
      ctx.moveTo(-r * 0.18, -r * 0.12);
      ctx.lineTo(-r * 0.48, r * 0.5);
      ctx.quadraticCurveTo(0, r * 0.68, r * 0.48, r * 0.5);
      ctx.lineTo(r * 0.18, -r * 0.12);
      ctx.stroke();
      line(ctx, -r * 0.32, r * 0.28, r * 0.32, r * 0.28);
      break;
    case 'focus':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        line(
          ctx,
          Math.cos(a) * r * 0.32,
          Math.sin(a) * r * 0.32,
          Math.cos(a) * r * 0.52,
          Math.sin(a) * r * 0.52,
        );
      }
      break;
    case 'environments':
      ctx.beginPath();
      ctx.arc(r * 0.28, -r * 0.26, r * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, r * 0.42);
      ctx.lineTo(-r * 0.18, -r * 0.12);
      ctx.lineTo(r * 0.06, r * 0.16);
      ctx.lineTo(r * 0.28, -r * 0.02);
      ctx.lineTo(r * 0.62, r * 0.42);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
  }
  ctx.restore();
}
