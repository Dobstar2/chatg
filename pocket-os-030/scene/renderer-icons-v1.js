import { SpatialRenderer as BaseSpatialRenderer } from './renderer.js';
import { clamp } from '../core/math.js';

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
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawAppIcon(ctx, id, x, y, size, active) {
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

  ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2); ctx.fill();

  switch (id) {
    case 'home':
      ctx.beginPath(); ctx.moveTo(-r*.62, r*.05); ctx.lineTo(0, -r*.55); ctx.lineTo(r*.62, r*.05); ctx.stroke();
      roundRect(ctx, -r*.43, -r*.02, r*.86, r*.62, r*.08); ctx.stroke();
      line(ctx, -r*.1, r*.6, -r*.1, r*.23); line(ctx, r*.1, r*.6, r*.1, r*.23);
      break;
    case 'library':
      for (const dx of [-.38, .12]) for (const dy of [-.38, .12]) { roundRect(ctx, r*dx, r*dy, r*.28, r*.28, r*.05); ctx.stroke(); }
      break;
    case 'cinema':
      roundRect(ctx, -r*.65, -r*.42, r*1.3, r*.84, r*.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r*.12, -r*.22); ctx.lineTo(r*.3, 0); ctx.lineTo(-r*.12, r*.22); ctx.closePath(); ctx.fillStyle = stroke; ctx.fill();
      break;
    case 'planetarium':
      ctx.beginPath(); ctx.arc(0, 0, r*.28, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r*.72, r*.28, -.35, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(r*.52, -r*.16, r*.09, 0, Math.PI*2); ctx.fillStyle = stroke; ctx.fill();
      break;
    case 'portal':
      ctx.beginPath(); ctx.ellipse(0, 0, r*.48, r*.7, 0, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = .65; ctx.beginPath(); ctx.ellipse(0, 0, r*.28, r*.5, 0, 0, Math.PI*2); ctx.stroke();
      break;
    case 'hologram':
      ctx.beginPath(); ctx.moveTo(0,-r*.6); ctx.lineTo(r*.52,-r*.28); ctx.lineTo(r*.52,r*.32); ctx.lineTo(0,r*.62); ctx.lineTo(-r*.52,r*.32); ctx.lineTo(-r*.52,-r*.28); ctx.closePath(); ctx.stroke();
      line(ctx,0,-r*.6,0,0); line(ctx,-r*.52,-r*.28,0,0); line(ctx,r*.52,-r*.28,0,0); line(ctx,0,0,0,r*.62);
      break;
    case 'arcade':
      ctx.beginPath(); ctx.arc(0, 0, r*.58, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r*.28, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r*.07, 0, Math.PI*2); ctx.fillStyle = stroke; ctx.fill();
      break;
    case 'music':
      line(ctx, r*.08, -r*.5, r*.08, r*.35); line(ctx, r*.08, -r*.5, r*.48, -r*.38); line(ctx, r*.48, -r*.38, r*.48, r*.2);
      ctx.beginPath(); ctx.arc(-r*.08, r*.42, r*.2, 0, Math.PI*2); ctx.fillStyle = stroke; ctx.fill();
      ctx.beginPath(); ctx.arc(r*.32, r*.27, r*.2, 0, Math.PI*2); ctx.fill();
      break;
    case 'mini-worlds':
      ctx.beginPath(); ctx.arc(0, 0, r*.55, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r*.48,r*.14); ctx.quadraticCurveTo(-r*.2,-r*.18,0,r*.06); ctx.quadraticCurveTo(r*.25,r*.3,r*.5,-r*.04); ctx.stroke();
      line(ctx,-r*.7,r*.58,r*.7,r*.58);
      break;
    case 'passthrough':
      roundRect(ctx, -r*.62, -r*.38, r*1.24, r*.76, r*.13); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r*.25, 0, Math.PI*2); ctx.stroke();
      roundRect(ctx, -r*.28, -r*.56, r*.56, r*.16, r*.05); ctx.stroke();
      break;
    case 'gallery':
      roundRect(ctx, -r*.62, -r*.48, r*1.24, r*.96, r*.12); ctx.stroke();
      ctx.beginPath(); ctx.arc(r*.28,-r*.2,r*.1,0,Math.PI*2); ctx.fillStyle=stroke; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r*.48,r*.3); ctx.lineTo(-r*.12,-r*.04); ctx.lineTo(r*.08,r*.16); ctx.lineTo(r*.28,-r*.04); ctx.lineTo(r*.5,r*.3); ctx.stroke();
      break;
    case 'browser':
      ctx.beginPath(); ctx.arc(0, 0, r*.58, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r*.24, r*.58, 0, 0, Math.PI*2); ctx.stroke();
      line(ctx,-r*.54,0,r*.54,0); line(ctx,-r*.42,-r*.3,r*.42,-r*.3); line(ctx,-r*.42,r*.3,r*.42,r*.3);
      break;
    case 'clock':
      ctx.beginPath(); ctx.arc(0,0,r*.58,0,Math.PI*2); ctx.stroke();
      line(ctx,0,0,0,-r*.34); line(ctx,0,0,r*.28,r*.18);
      break;
    case 'settings':
      ctx.beginPath(); ctx.arc(0,0,r*.22,0,Math.PI*2); ctx.stroke();
      for (let i=0;i<8;i++) { const a=i*Math.PI/4; line(ctx,Math.cos(a)*r*.36,Math.sin(a)*r*.36,Math.cos(a)*r*.58,Math.sin(a)*r*.58); }
      ctx.beginPath(); ctx.arc(0,0,r*.48,0,Math.PI*2); ctx.stroke();
      break;
    case 'system-info':
      ctx.beginPath(); ctx.arc(0,0,r*.58,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,-r*.28,r*.06,0,Math.PI*2); ctx.fillStyle=stroke; ctx.fill();
      line(ctx,0,-r*.06,0,r*.34);
      break;
    case 'tracking-lab':
      line(ctx,-r*.55,0,r*.55,0); line(ctx,0,-r*.55,0,r*.55);
      ctx.beginPath(); ctx.arc(0,0,r*.34,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,r*.08,0,Math.PI*2); ctx.fillStyle=stroke; ctx.fill();
      break;
    case 'labs':
      line(ctx,-r*.18,-r*.58,-r*.18,-r*.12); line(ctx,r*.18,-r*.58,r*.18,-r*.12); line(ctx,-r*.28,-r*.58,r*.28,-r*.58);
      ctx.beginPath(); ctx.moveTo(-r*.18,-r*.12); ctx.lineTo(-r*.48,r*.5); ctx.quadraticCurveTo(0,r*.68,r*.48,r*.5); ctx.lineTo(r*.18,-r*.12); ctx.stroke();
      line(ctx,-r*.32,r*.28,r*.32,r*.28);
      break;
    case 'focus':
      ctx.beginPath(); ctx.arc(0,0,r*.58,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,r*.12,0,Math.PI*2); ctx.fillStyle=stroke; ctx.fill();
      for (let i=0;i<4;i++) { const a=i*Math.PI/2; line(ctx,Math.cos(a)*r*.32,Math.sin(a)*r*.32,Math.cos(a)*r*.52,Math.sin(a)*r*.52); }
      break;
    case 'environments':
      ctx.beginPath(); ctx.arc(r*.28,-r*.26,r*.16,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r*.62,r*.42); ctx.lineTo(-r*.18,-r*.12); ctx.lineTo(r*.06,r*.16); ctx.lineTo(r*.28,-r*.02); ctx.lineTo(r*.62,r*.42); ctx.stroke();
      break;
    default:
      ctx.beginPath(); ctx.arc(0,0,r*.48,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,r*.12,0,Math.PI*2); ctx.fillStyle=stroke; ctx.fill();
  }
  ctx.restore();
}

export class SpatialRenderer extends BaseSpatialRenderer {
  _drawTargetCard(ctx, eye, state, target, { label, sublabel = '', size = 0.19 } = {}) {
    const p = this._project(target.position, eye, state);
    if (!p) return;
    const s = size * p.scale;
    const active = state.aim?.targetId === target.id;
    const x = p.x - s / 2;
    const y = p.y - s / 2;

    roundRect(ctx, x, y, s, s, Math.min(18, s * .2));
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, active ? 'rgba(177,221,255,.31)' : 'rgba(255,255,255,.11)');
    g.addColorStop(1, active ? 'rgba(77,121,190,.23)' : 'rgba(255,255,255,.04)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = active ? 'rgba(205,235,255,.78)' : 'rgba(255,255,255,.14)';
    ctx.lineWidth = active ? 1.6 : 1; ctx.stroke();

    const appId = appIdFromTarget(target);
    drawAppIcon(ctx, appId, p.x, p.y - s * .10, s, active);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = active ? '#ffffff' : '#eaf2ff';
    ctx.font = `700 ${clamp(8.5 / p.depth, 6.8, 10.5)}px -apple-system, system-ui`;
    ctx.fillText(label || target.label || '', p.x, p.y + s * .31);
    if (sublabel && active && size >= .18) {
      ctx.fillStyle = 'rgba(210,231,255,.68)';
      ctx.font = `600 ${clamp(6.2 / p.depth, 5.4, 7.8)}px -apple-system, system-ui`;
      ctx.fillText(sublabel, p.x, p.y + s * .42);
    }
  }
}
