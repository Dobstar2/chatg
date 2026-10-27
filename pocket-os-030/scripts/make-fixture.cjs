const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.POCKET_BROWSER_CHANNEL ? { channel: process.env.POCKET_BROWSER_CHANNEL } : {}),
  });
  const page = await browser.newPage();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    function draw(t) {
      for (let eye = 0; eye < 2; eye++) {
        ctx.fillStyle = eye ? '#3266ac' : '#b2533d';
        ctx.fillRect(eye * 320, 0, 320, 180);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 44px system-ui';
        ctx.fillText(eye ? 'RIGHT' : 'LEFT', eye * 320 + 160, 90);
        ctx.font = '16px system-ui';
        ctx.fillText('Pocket VR · original stereo fixture', eye * 320 + 160, 125);
        ctx.fillRect(eye * 320 + 30 + (t % 200), 150, 12, 12);
      }
    }
    draw(0);
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/mp4;codecs=avc1.42E01E',
      videoBitsPerSecond: 180000,
    });
    const chunks = [];
    const done = new Promise((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () =>
        resolve(
          Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer())),
        );
    });
    recorder.start();
    let t = 0;
    const timer = setInterval(() => draw((t += 6)), 83);
    await new Promise((r) => setTimeout(r, 2400));
    clearInterval(timer);
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    return done;
  });
  fs.writeFileSync('assets/stereo-test.mp4', Buffer.from(bytes));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
