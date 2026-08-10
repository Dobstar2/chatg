const BUILD_ID = 'v0.8.2';
const BUILD_TIME = '10 Aug 2026 17:48 BST';

const camera = document.getElementById('camera');
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const startStatus = document.getElementById('startStatus');
const motionState = document.getElementById('motionState');
const handState = document.getElementById('handState');
const cameraState = document.getElementById('cameraState');
const lookState = document.getElementById('lookState');
const buildState = document.getElementById('buildState');
const startBuild = document.getElementById('startBuild');
const installHint = document.getElementById('installHint');
const recenterButton = document.getElementById('recenterButton');
const worldTemplate = document.getElementById('worldTemplate');

const worlds = [...document.querySelectorAll('.world')];
worlds.forEach((world) => world.appendChild(worldTemplate.content.cloneNode(true)));

const shells = worlds.map((world) => world.querySelector('.shell'));
const cursors = worlds.map((world) => world.querySelector('.cursor'));
const handCanvases = worlds.map((world) => world.querySelector('.hand-layer'));
const gestureStates = worlds.map((world) => world.querySelector('[data-gesture-state]'));
const targetStates = worlds.map((world) => world.querySelector('[data-target-state]'));

if (buildState) buildState.textContent = `BUILD ${BUILD_ID}`;
if (startBuild) startBuild.textContent = `BUILD ${BUILD_ID} • ${BUILD_TIME}`;
document.documentElement.dataset.build = BUILD_ID;

const isStandalone = () => Boolean(window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches);
if (installHint) installHint.hidden = isStandalone();

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const expSmoothing = (dtMs, tauMs) => 1 - Math.exp(-dtMs / tauMs);

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const PALM = [0,1,5,9,13,17];

let baselineQuat = null;
let currentQuat = null;
let targetPose = { yaw: 0, pitch: 0, roll: 0 };
let smoothPose = { yaw: 0, pitch: 0, roll: 0 };
let motionEnabled = false;
let lastFrameAt = 0;
let renderLoopActive = true;

let stream = null;
let handLandmarker = null;
let handTrackingActive = false;
let handTimer = null;
let lastVideoTime = -1;
let lastHandSeenAt = 0;
let handIntervalMs = 72;
let searchCount = 0;

let targetHand = null;
let smoothHand = null;
let handVisible = false;
let handOpacity = 0;
let targetPointer = { x: 0.5, y: 0.5 };
let smoothPointer = { x: 0.5, y: 0.5 };
let pointerVelocity = { x: 0, y: 0 };
let lastPointerSampleAt = 0;
let pinchDown = false;
let wasPinching = false;
let mirrorHand = false;
let passthrough = false;
let hoveredAction = null;
let lastSelectionAt = 0;
let lastHitTestAt = 0;
let overlaySizes = worlds.map(() => ({ width: 1, height: 1, dpr: 1 }));

const trackerPreviews = worlds.map((world, index) => {
  const wrap = document.createElement('div');
  wrap.className = 'tracker-preview-wrap';
  Object.assign(wrap.style, { position:'absolute', zIndex:'18', left:'10px', bottom:'10px', width:'118px', height:'74px', border:'1px solid rgba(116,246,194,.65)', borderRadius:'12px', overflow:'hidden', background:'#000', pointerEvents:'none' });
  const canvas = document.createElement('canvas');
  canvas.width = 236; canvas.height = 148;
  Object.assign(canvas.style, { width:'100%', height:'100%', display:'block' });
  wrap.appendChild(canvas);
  const label = document.createElement('div');
  label.textContent = index === 0 ? 'TRACKER VIEW' : 'SHOW HAND HERE';
  Object.assign(label.style, { position:'absolute', left:'5px', top:'5px', padding:'3px 5px', borderRadius:'7px', background:'rgba(0,0,0,.72)', color:'#74f6c2', font:'800 7px/1 -apple-system, system-ui' });
  wrap.appendChild(label);
  world.appendChild(wrap);
  return canvas;
});

function setPanel(title, message) {
  worlds.forEach((world) => {
    const panel = world.querySelector('[data-panel="message"]');
    if (panel) panel.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  });
}

function setGestureGuide(state, target = '') {
  gestureStates.forEach((node) => { if (node) node.textContent = state; });
  targetStates.forEach((node) => { if (node) node.textContent = target; });
}

function qNormalize(q) { const length = Math.hypot(q.x,q.y,q.z,q.w)||1; return {x:q.x/length,y:q.y/length,z:q.z/length,w:q.w/length}; }
function qMultiply(a,b){ return {x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z}; }
function qConjugate(q){ return {x:-q.x,y:-q.y,z:-q.z,w:q.w}; }
function qAxisAngle(x,y,z,angle){ const h=angle*.5,s=Math.sin(h); return {x:x*s,y:y*s,z:z*s,w:Math.cos(h)}; }
function qFromEulerYXZ(x,y,z){ const c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2),s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2); return {x:s1*c2*c3+c1*s2*s3,y:c1*s2*c3-s1*c2*s3,z:c1*c2*s3-s1*s2*c3,w:c1*c2*c3+s1*s2*s3}; }
function qRotateVector(q,v){ const r=qMultiply(qMultiply(q,{x:v.x,y:v.y,z:v.z,w:0}),qConjugate(q)); return {x:r.x,y:r.y,z:r.z}; }
function screenAngleDegrees(){ const a=screen.orientation?.angle; if(Number.isFinite(a)) return ((a%360)+360)%360; if(Number.isFinite(window.orientation)) return ((Number(window.orientation)%360)+360)%360; return 0; }
function deviceQuaternion(alpha,beta,gamma){ const e=qFromEulerYXZ(beta*DEG,alpha*DEG,-gamma*DEG); return qNormalize(qMultiply(qMultiply(e,qAxisAngle(1,0,0,-Math.PI/2)),qAxisAngle(0,0,1,-screenAngleDegrees()*DEG))); }
function relativePose(base,current){ const r=qNormalize(qMultiply(qConjugate(base),current)); const f=qRotateVector(r,{x:0,y:0,z:-1}),u=qRotateVector(r,{x:0,y:1,z:0}); return {yaw:clamp(Math.atan2(-f.x,-f.z)*RAD,-50,50),pitch:clamp(Math.asin(clamp(f.y,-1,1))*RAD,-38,38),roll:clamp(Math.atan2(u.x,u.y)*RAD,-26,26)}; }

function recenter(){ if(currentQuat) baselineQuat={...currentQuat}; targetPose={yaw:0,pitch:0,roll:0}; smoothPose={yaw:0,pitch:0,roll:0}; setPanel('Recentered','Forward is now your current headset direction.'); }
function onOrientation(event){ const a=Number.isFinite(event.alpha)?event.alpha:0,b=Number.isFinite(event.beta)?event.beta:0,g=Number.isFinite(event.gamma)?event.gamma:0; currentQuat=deviceQuaternion(a,b,g); if(!baselineQuat) baselineQuat={...currentQuat}; const p=relativePose(baselineQuat,currentQuat); targetPose.yaw=Math.abs(p.yaw)<.12?0:p.yaw; targetPose.pitch=Math.abs(p.pitch)<.12?0:p.pitch; targetPose.roll=Math.abs(p.roll)<.18?0:p.roll; if(!motionEnabled){ motionEnabled=true; motionState.textContent='HEAD: LIVE'; } }
async function enableMotion(){ try{ const requests=[]; if(typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function') requests.push(DeviceMotionEvent.requestPermission()); if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function') requests.push(DeviceOrientationEvent.requestPermission()); const results=await Promise.all(requests); if(results.some((r)=>r!=='granted')) throw new Error('Motion and orientation permission are required.'); window.addEventListener('deviceorientation',onOrientation,{capture:true,passive:true}); motionState.textContent='HEAD: READY'; }catch(error){ motionState.textContent='HEAD: BLOCKED'; setPanel('Head tracking unavailable',error.message||'Motion access is blocked.'); } }

function cameraScore(device){ const label=(device.label||'').toLowerCase(); if(/front|user|facetime|selfie/.test(label)) return -1000; let score=0; const ultra=/ultra[ -]?wide|0\.5|0,5/.test(label),tele=/tele|telephoto/.test(label); if(/back|rear|environment/.test(label)) score+=220; if(!ultra&&/wide|main|camera/.test(label)) score+=160; if(ultra) score-=120; if(tele) score-=160; return score; }
function isDefinitelyFrontTrack(track){ const settings=typeof track.getSettings==='function'?track.getSettings():{}; const label=(track.label||'').toLowerCase(); return settings.facingMode==='user'||/front|user|facetime|selfie/.test(label); }
async function openRearByFacingMode(){ return navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'environment'},width:{ideal:640,max:960},height:{ideal:480,max:720},frameRate:{ideal:30,max:30}},audio:false}); }
async function selectBestRearCamera(){ let initial; try{ initial=await openRearByFacingMode(); }catch(_){ initial=await navigator.mediaDevices.getUserMedia({video:true,audio:false}); } const devices=await navigator.mediaDevices.enumerateDevices(); const ranked=devices.filter((d)=>d.kind==='videoinput').map((device)=>({device,score:cameraScore(device)})).filter(({score})=>score>0).sort((a,b)=>b.score-a.score); if(ranked.length){ initial.getTracks().forEach((t)=>t.stop()); for(const {device} of ranked){ try{ const selected=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:device.deviceId},width:{ideal:640,max:960},height:{ideal:480,max:720},frameRate:{ideal:30,max:30}},audio:false}); if(!isDefinitelyFrontTrack(selected.getVideoTracks()[0])) return selected; selected.getTracks().forEach((t)=>t.stop()); }catch(_){} } } if(isDefinitelyFrontTrack(initial.getVideoTracks()[0])){ initial.getTracks().forEach((t)=>t.stop()); return openRearByFacingMode(); } return initial; }
async function enableCamera(){ if(!navigator.mediaDevices?.getUserMedia){ cameraState.textContent='CAMERA: UNSUPPORTED'; return false; } try{ stream=await selectBestRearCamera(); const track=stream.getVideoTracks()[0]; if(!track||isDefinitelyFrontTrack(track)) throw new Error('Rear camera required.'); camera.srcObject=stream; await camera.play(); const caps=typeof track.getCapabilities==='function'?track.getCapabilities():{}; if(caps.zoom&&typeof track.applyConstraints==='function'){ const min=Number.isFinite(caps.zoom.min)?caps.zoom.min:1,max=Number.isFinite(caps.zoom.max)?caps.zoom.max:1,trackingZoom=clamp(1,min,max); try{ await track.applyConstraints({advanced:[{zoom:trackingZoom}]}); }catch(_){} } const label=track.label||''; cameraState.textContent=/ultra[ -]?wide|0\.5|0,5/i.test(label)?'CAMERA: REAR 0.5X':'CAMERA: REAR 1X'; return true; }catch(_){ stream?.getTracks().forEach((t)=>t.stop()); stream=null; camera.srcObject=null; cameraState.textContent='CAMERA: REAR REQUIRED'; setPanel('Rear camera unavailable','SpatialHands only uses a rear camera.'); return false; } }

async function createLandmarker(vision,fileset,useGpu){ return vision.HandLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',...(useGpu?{delegate:'GPU'}:{})},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.24,minHandPresenceConfidence:.24,minTrackingConfidence:.24}); }
async function enableHandTracking(){ if(!stream) return; try{ handState.textContent='HAND: LOADING'; const vision=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm'); const fileset=await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'); try{ handLandmarker=await createLandmarker(vision,fileset,true); handState.textContent='HAND: GPU'; }catch(_){ handLandmarker=await createLandmarker(vision,fileset,false); handState.textContent='HAND: CPU'; } handTrackingActive=true; searchCount=0; setGestureGuide('PUT HAND IN TRACKER VIEW','Palm toward camera · 30–70 cm away'); scheduleHandFrame(40); }catch(error){ handState.textContent='HAND: ERROR'; setGestureGuide('HAND TRACKER FAILED','Reload and allow camera access'); setPanel('Hand tracking error',error?.message||'The hand model could not start.'); } }

function distance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function mapHandX(x){ const mapped=mirrorHand?1-x:x; return clamp(.5+(mapped-.5)*1.25,.02,.98); }
function mapHandY(y){ return clamp(.5+(y-.5)*1.2,.02,.98); }
function updatePointerFromLandmarks(landmarks,now){ const tip=landmarks[8]; const next={x:mapHandX(tip.x),y:mapHandY(tip.y)}; if(lastPointerSampleAt){ const dt=Math.max(16,now-lastPointerSampleAt); pointerVelocity.x=(next.x-targetPointer.x)/dt; pointerVelocity.y=(next.y-targetPointer.y)/dt; } targetPointer=next; lastPointerSampleAt=now; }
function processDetectedHand(landmarks,now){ searchCount=0; targetHand=landmarks.map((p)=>({x:p.x,y:p.y})); if(!smoothHand) smoothHand=targetHand.map((p)=>({...p})); updatePointerFromLandmarks(landmarks,now); lastHandSeenAt=now; handVisible=true; const wrist=landmarks[0],thumb=landmarks[4],index=landmarks[8],middle=landmarks[9],palmScale=Math.max(distance(wrist,middle),.025),ratio=distance(thumb,index)/palmScale,nextPinch=pinchDown?ratio<.62:ratio<.40; pinchDown=nextPinch; handState.textContent=nextPinch?'HAND: PINCH':'HAND: LIVE'; if(nextPinch&&!wasPinching&&hoveredAction) triggerAction(hoveredAction); wasPinching=nextPinch; }
function scheduleHandFrame(delay=handIntervalMs){ clearTimeout(handTimer); if(handTrackingActive) handTimer=setTimeout(processHandFrame,delay); }
function processHandFrame(){ if(!handTrackingActive||!handLandmarker) return; if(document.hidden||camera.readyState<2||camera.videoWidth<2){ scheduleHandFrame(120); return; } if(camera.currentTime===lastVideoTime){ scheduleHandFrame(24); return; } lastVideoTime=camera.currentTime; const started=performance.now(); try{ const result=handLandmarker.detectForVideo(camera,started); const landmarks=result.landmarks?.[0]; if(landmarks){ processDetectedHand(landmarks,started); }else if(started-lastHandSeenAt>180){ searchCount+=1; handVisible=false; pinchDown=false; wasPinching=false; handState.textContent='HAND: SEARCH'; setGestureGuide('HAND: SEARCHING',searchCount>20?'Move hand closer until it fills tracker box':'Palm toward camera · fingers apart'); } }catch(_){ handState.textContent='HAND: RETRY'; } const work=performance.now()-started; handIntervalMs=clamp(Math.round(work*1.55+26),52,105); scheduleHandFrame(handIntervalMs); }

function resizeOverlays(){ const dpr=Math.min(window.devicePixelRatio||1,1.5); overlaySizes=handCanvases.map((canvas,index)=>{ const world=worlds[index],width=Math.max(1,world.clientWidth),height=Math.max(1,world.clientHeight); canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr); return {width,height,dpr}; }); }
function handPoint(point,size){ return {x:mapHandX(point.x)*size.width,y:mapHandY(point.y)*size.height}; }
function drawHand(canvas,size,alpha){ const ctx=canvas.getContext('2d'); ctx.setTransform(size.dpr,0,0,size.dpr,0,0); ctx.clearRect(0,0,size.width,size.height); if(!smoothHand||alpha<.02) return; ctx.save(); ctx.globalAlpha=alpha; ctx.lineCap='round'; ctx.lineJoin='round'; const palm=PALM.map((i)=>handPoint(smoothHand[i],size)); ctx.beginPath(); palm.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y)); ctx.closePath(); ctx.fillStyle='rgba(116,246,194,.16)'; ctx.fill(); ctx.strokeStyle='rgba(116,246,194,.82)'; ctx.lineWidth=7; HAND_CONNECTIONS.forEach(([a,b])=>{ const p1=handPoint(smoothHand[a],size),p2=handPoint(smoothHand[b],size); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); }); ctx.fillStyle='rgba(235,255,249,.95)'; smoothHand.forEach((point,index)=>{ const p=handPoint(point,size); ctx.beginPath(); ctx.arc(p.x,p.y,index===8?5.5:3.2,0,Math.PI*2); ctx.fill(); }); ctx.restore(); }
function drawTrackerPreview(){ if(!stream||camera.readyState<2||camera.videoWidth<2) return; trackerPreviews.forEach((canvas)=>{ const ctx=canvas.getContext('2d'),cw=canvas.width,ch=canvas.height,vw=camera.videoWidth,vh=camera.videoHeight,scale=Math.max(cw/vw,ch/vh),dw=vw*scale,dh=vh*scale,dx=(cw-dw)/2,dy=(ch-dh)/2; ctx.clearRect(0,0,cw,ch); ctx.drawImage(camera,dx,dy,dw,dh); ctx.strokeStyle=handVisible?'#74f6c2':'#ffd68b'; ctx.lineWidth=5; ctx.strokeRect(2.5,2.5,cw-5,ch-5); }); }

function buttonUnderLeftCursor(){ if(!handVisible||!cursors[0]) return null; const rect=cursors[0].getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,element=document.elementFromPoint(x,y); return element?.closest?.('button[data-action]')||null; }
function updateInteraction(now){ if(now-lastHitTestAt<32) return; lastHitTestAt=now; const target=buttonUnderLeftCursor(),nextAction=target?.dataset.action||null; if(nextAction!==hoveredAction){ hoveredAction=nextAction; worlds.forEach((world)=>world.querySelectorAll('button[data-action]').forEach((button)=>button.classList.toggle('hovered',Boolean(nextAction&&button.dataset.action===nextAction)))); } if(!handVisible) setGestureGuide('PUT HAND IN TRACKER VIEW','Palm toward camera · move closer'); else if(pinchDown) setGestureGuide('✓ PINCH DETECTED',target?`CLICK ${target.textContent.trim()}`:'Move ring onto a tile'); else if(target) setGestureGuide('👌 PINCH TO CLICK',target.textContent.trim()); else setGestureGuide('☝ INDEX CONTROLS RING','Move green ring onto a tile'); }
function triggerAction(action){ const now=performance.now(); if(now-lastSelectionAt<350) return; lastSelectionAt=now; if(navigator.vibrate) navigator.vibrate(18); switch(action){ case'passthrough':passthrough=!passthrough;document.body.classList.toggle('passthrough',passthrough);setPanel('Passthrough',passthrough?'Rear camera view enabled.':'Virtual background restored.');break; case'settings':mirrorHand=!mirrorHand;setPanel('Hand direction',mirrorHand?'Pointer direction flipped.':'Pointer direction follows camera view.');break; case'recenter':recenter();break; case'browser':setPanel('Browser','Browser surface selected.');break; case'media':setPanel('Media','Media surface selected.');break; case'info':setPanel('SpatialHands VR',`Build ${BUILD_ID}. Green ring = index fingertip. Thumb + index pinch = click.`);break; default:setPanel('Home','Use your index fingertip to move the green ring. Pinch thumb + index to click.'); } }

function renderFrame(now){ if(!renderLoopActive) return; const dt=clamp(lastFrameAt?now-lastFrameAt:16.7,7,40); lastFrameAt=now; if(motionEnabled&&baselineQuat){ const h=expSmoothing(dt,20); smoothPose.yaw+=(targetPose.yaw-smoothPose.yaw)*h; smoothPose.pitch+=(targetPose.pitch-smoothPose.pitch)*h; smoothPose.roll+=(targetPose.roll-smoothPose.roll)*h; shells.forEach((shell,index)=>{ const eyeOffset=index===0?4:-4,tx=(-smoothPose.yaw*3.25)+eyeOffset,ty=smoothPose.pitch*2.1; shell.style.transform=`translate3d(calc(-50% + ${tx.toFixed(2)}px), calc(-50% + ${ty.toFixed(2)}px), 0) rotateZ(${(-smoothPose.roll*.08).toFixed(2)}deg) rotateY(${(smoothPose.yaw*.16).toFixed(2)}deg) rotateX(${(-smoothPose.pitch*.11).toFixed(2)}deg)`; }); if(lookState){ const horizontal=smoothPose.yaw>1?'RIGHT':smoothPose.yaw<-1?'LEFT':'CENTER',vertical=smoothPose.pitch>1?'UP':smoothPose.pitch<-1?'DOWN':''; lookState.textContent=`LOOK: ${horizontal}${vertical?` + ${vertical}`:''}`; } } if(targetHand&&smoothHand){ const a=expSmoothing(dt,42); for(let i=0;i<smoothHand.length;i++){ smoothHand[i].x+=(targetHand[i].x-smoothHand[i].x)*a; smoothHand[i].y+=(targetHand[i].y-smoothHand[i].y)*a; } } handOpacity+=((handVisible?1:0)-handOpacity)*expSmoothing(dt,handVisible?50:100); const age=lastPointerSampleAt?Math.min(now-lastPointerSampleAt,70):0,predicted={x:clamp(targetPointer.x+pointerVelocity.x*age,.02,.98),y:clamp(targetPointer.y+pointerVelocity.y*age,.02,.98)},p=expSmoothing(dt,28); smoothPointer.x+=(predicted.x-smoothPointer.x)*p; smoothPointer.y+=(predicted.y-smoothPointer.y)*p; worlds.forEach((world,index)=>{ const size=overlaySizes[index],cursor=cursors[index],px=smoothPointer.x*size.width,py=smoothPointer.y*size.height; cursor.style.transform=`translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`; cursor.style.opacity=handVisible?'1':'.18'; cursor.classList.toggle('pinching',pinchDown); cursor.classList.toggle('targeted',Boolean(hoveredAction)); drawHand(handCanvases[index],size,handOpacity); }); updateInteraction(now); requestAnimationFrame(renderFrame); }

async function requestImmersiveMode(){ try{ if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({navigationUI:'hide'}); }catch(_){} try{ if(screen.orientation?.lock) await screen.orientation.lock('landscape'); }catch(_){} }
async function startVR(){ startButton.disabled=true; startStatus.textContent=`Starting ${BUILD_ID}…`; await enableMotion(); const cameraOkay=await enableCamera(); if(cameraOkay) await enableHandTracking(); await requestImmersiveMode(); startScreen.classList.add('hidden'); requestAnimationFrame(()=>{resizeOverlays();recenter();}); setPanel(cameraOkay?'Tracking camera ready':'Head tracking active',cameraOkay?'Look at the TRACKER VIEW box. Put your palm in that camera view, then use your index fingertip as the pointer.':'Rear camera unavailable, so hand control is disabled.'); }
startButton.addEventListener('click',startVR); recenterButton.addEventListener('click',recenter); worlds.forEach((world)=>world.addEventListener('click',(event)=>{const button=event.target.closest('button[data-action]');if(button)triggerAction(button.dataset.action);})); window.addEventListener('resize',()=>requestAnimationFrame(resizeOverlays),{passive:true}); window.addEventListener('orientationchange',()=>setTimeout(()=>{resizeOverlays();if(currentQuat)recenter();},220),{passive:true}); document.addEventListener('visibilitychange',()=>{if(!document.hidden&&handTrackingActive)scheduleHandFrame(40);}); window.addEventListener('pagehide',()=>{renderLoopActive=false;handTrackingActive=false;clearTimeout(handTimer);clearInterval(drawTrackerPreview.timer);stream?.getTracks().forEach((track)=>track.stop());});

resizeOverlays(); drawTrackerPreview.timer=setInterval(drawTrackerPreview,120); requestAnimationFrame(renderFrame);
