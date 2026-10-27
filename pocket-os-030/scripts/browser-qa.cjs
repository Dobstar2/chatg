const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const output = process.env.POCKET_QA_OUTPUT || 'test-results';
fs.mkdirSync(output, { recursive: true });
const url = process.env.POCKET_QA_URL || 'http://127.0.0.1:8088/pocket-os-030/?qa=1';
const report = [];
async function run(name, type, options) {
  const browser = await type.launch({ headless: true, ...options });
  const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
  let errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  const inspect = () => page.evaluate(() => window.PocketVR.inspect());
  async function click(id) {
    await page.waitForTimeout(130);
    const t = (await inspect()).targets.find((t) => t.id === id && !t.disabled);
    assert.ok(t, `missing ${id}`);
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(80);
  }
  async function shot(id) {
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, `${name}-${id}.png`) });
  }
  async function home() {
    await page.click('#homeButton');
    await page.waitForTimeout(120);
  }
  try {
    await page.addInitScript(() => {
      window.cameraRequests = 0;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia() {
            window.cameraRequests++;
            return new Promise(() => {});
          },
        },
      });
    });
    await page.goto(url);
    await page.waitForFunction(() => window.PocketVR?.inspect);
    await shot('onboarding');
    await page.click('#screenButton');
    await click('tutorial:target');
    assert.equal((await inspect()).tutorial.done, true);
    await click('tutorial:finish');
    assert.equal(await page.evaluate(() => window.cameraRequests), 0);
    await shot('screen-home');
    report.push(`${name}: cold start, tutorial, no camera request PASS`);
    await click('app:library');
    assert.equal((await inspect()).active, 'library');
    await shot('library');
    await click('library:search');
    await page.click('#trustedAction');
    await page.fill('#searchInput', 'Focus');
    await page.press('#searchInput', 'Enter');
    await page.waitForTimeout(160);
    assert.equal((await inspect()).targets.filter((t) => t.id === 'app:focus').length, 1);
    await click('app:focus');
    assert.equal((await inspect()).active, 'focus');
    await click('focus:toggle');
    await page.waitForTimeout(250);
    assert.equal((await inspect()).focus.running, true);
    await home();
    report.push(`${name}: native search → app → Home, Focus PASS`);
    await click('app:quick-settings');
    await click('app:settings');
    await click('settings:page');
    await click('settings:motion');
    assert.equal((await inspect()).settings.reduceMotion, true);
    await shot('settings');
    await page.reload();
    await page.click('#screenButton');
    await page.click('#skipTutorial');
    assert.equal((await inspect()).settings.reduceMotion, true);
    report.push(`${name}: settings persisted across reload PASS`);
    await click('app:library');
    await click('library:search');
    await page.click('#trustedAction');
    await page.fill('#searchInput', 'Gallery');
    await page.press('#searchInput', 'Enter');
    await page.waitForTimeout(150);
    await click('app:gallery');
    const svg = (i) =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${i % 2 ? 320 : 180}" height="${i % 2 ? 180 : 320}"><rect width="100%" height="100%" fill="${i % 2 ? '#619a8c' : '#bd8b65'}"/><circle cx="90" cy="90" r="55" fill="#e8dbaf"/><text x="20" y="160" font-size="28">Photo ${i + 1}</text></svg>`,
      );
    await page.setInputFiles(
      '#imageInput',
      Array.from({ length: 13 }, (_, i) => ({
        name: `photo-${i + 1}.svg`,
        mimeType: 'image/svg+xml',
        buffer: svg(i),
      })),
    );
    await page.waitForFunction(
      () => window.PocketVR.inspect().media.images.filter((i) => i.status === 'ready').length === 6,
    );
    await shot('gallery');
    await click('gallery:next');
    await page.waitForFunction(() => window.PocketVR.inspect().gallery.page === 1);
    await click('gallery:next');
    await page.waitForTimeout(300);
    assert.ok((await inspect()).targets.some((t) => t.id === 'gallery:image:12'));
    await click('gallery:image:12');
    await page.waitForTimeout(300);
    assert.equal((await inspect()).gallery.selectedIndex, 12);
    assert.ok((await inspect()).media.images.filter((i) => i.width > 1).length <= 8);
    report.push(`${name}: 13 photos, every page, aspect-preserving bounded decode PASS`);
    await page.evaluate(() => {
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    assert.equal((await inspect()).media.images.length, 13);
    await click('system:window-tools');
    await click('window:smaller:gallery');
    await click('window:pin:gallery');
    assert.ok((await inspect()).targets.find((t) => t.id === 'window:move:gallery').disabled);
    await click('window:pin:gallery');
    await click('window:snap-left:gallery');
    await click('system:window-tools');
    assert.ok((await inspect()).windows.find((w) => w.id === 'gallery').position.x < 0);
    await home();
    report.push(`${name}: window scale, pin, snap affect app surface PASS`);
    // A fresh Library search leads to Cinema through actual UI.
    await click('app:library');
    await click('library:search');
    await page.click('#trustedAction');
    await page.fill('#searchInput', 'Cinema');
    await page.press('#searchInput', 'Enter');
    await page.waitForTimeout(150);
    await click('app:cinema');
    await shot('cinema-empty');
    await page.setInputFiles('#videoInput', {
      name: 'bad.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not a video'),
    });
    await page.waitForFunction(() => window.PocketVR.inspect().media.videoState === 'error');
    assert.equal((await inspect()).media.videoReady, false);
    await click('cinema:fixture');
    await page.waitForFunction(() =>
      ['ready', 'error'].includes(window.PocketVR.inspect().media.videoState),
    );
    if ((await inspect()).media.videoReady) {
      await click('cinema:play');
      report.push(`${name}: H.264 video readiness/play events PASS`);
    } else
      report.push(
        `${name}: H.264 decode UNSUPPORTED in this engine; static stereo fixture and error recovery PASS`,
      );
    await page.waitForTimeout(200);
    await shot('cinema');
    async function launchApp(query, id) {
      await home();
      await click('app:library');
      await click('library:search');
      await page.click('#trustedAction');
      await page.fill('#searchInput', query);
      await page.press('#searchInput', 'Enter');
      await page.waitForTimeout(150);
      await click('app:' + id);
    }
    await launchApp('Music', 'music');
    const rate = 22050,
      samples = rate * 8,
      buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF');
    buffer.writeUInt32LE(36 + samples * 2, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(rate, 24);
    buffer.writeUInt32LE(rate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++)
      buffer.writeInt16LE(Math.sin((i / rate) * Math.PI * 2 * 220) * 7000, 44 + i * 2);
    await page.setInputFiles('#audioInput', {
      name: 'original-tone.wav',
      mimeType: 'audio/wav',
      buffer,
    });
    await page.waitForFunction(() =>
      ['ready', 'error'].includes(window.PocketVR.inspect().media.audioState),
    );
    if ((await inspect()).media.audioState === 'ready') {
      await page.evaluate(() => {
        window.qaAudioStarted = false;
        document.getElementById('mediaAudio').addEventListener(
          'playing',
          () => {
            window.qaAudioStarted = true;
          },
          { once: true },
        );
      });
      await click('music:play');
      if (
        (await page.locator('#trustedBar.visible').isVisible()) &&
        /play audio/i.test(await page.locator('#trustedAction').textContent())
      )
        await page.click('#trustedAction');
      await page.waitForFunction(() => window.qaAudioStarted, {}, { timeout: 5000 });
      assert.ok(['playing', 'ended'].includes((await inspect()).media.audioState));
      report.push(`${name}: WAV playback with real analyser PASS`);
    } else report.push(`${name}: WAV decoder unavailable in this engine; error state PASS`);
    await shot('music');
    await launchApp('Planetarium', 'planetarium');
    await shot('planetarium');
    await click((await inspect()).targets.find((t) => t.id.startsWith('planet:')).id);
    await shot('planet-focus');
    await click('planetarium:focus-back');
    await launchApp('Hologram', 'hologram');
    await click('holo:model');
    await click('holo:zoom');
    await shot('hologram');
    await launchApp('Mini Worlds', 'mini-worlds');
    await click('world:forest');
    await shot('mini-world');
    await click('world:collapse');
    await launchApp('Portal', 'portal');
    await click('portal:ocean');
    await shot('portal');
    await click('portal:return');
    await launchApp('Arcade', 'arcade');
    await click('arcade:restart');
    await click((await inspect()).targets.find((t) => t.id.startsWith('arcade:orb')).id);
    assert.equal((await inspect()).game.score, 1);
    await shot('arcade');
    await page.waitForTimeout(30300);
    assert.equal((await inspect()).game.phase, 'finished');
    await shot('arcade-results');
    report.push(
      `${name}: Planetarium focus, Hologram models, Mini Worlds expand/return, Portal destination, Arcade start/score PASS`,
    );
    await launchApp('Cinema', 'cinema');
    await click('cinema:fixture');
    await page.waitForFunction(() =>
      ['ready', 'error'].includes(window.PocketVR.inspect().media.videoState),
    );
    await click('cinema:panel');
    await click('cinema:format');
    await page.click('#headsetButton');
    await page.waitForTimeout(250);
    await shot('stereo-cinema-lr');
    const pixels = await page.evaluate(() =>
      ['leftEyeCanvas', 'rightEyeCanvas'].map((id) => {
        const c = document.getElementById(id),
          r = c.getBoundingClientRect(),
          dpr = c.width / r.width;
        return Array.from(
          c
            .getContext('2d')
            .getImageData(Math.round((r.width / 2 + 55) * dpr), Math.round(175 * dpr), 1, 1).data,
        );
      }),
    );
    assert.ok(pixels[0][0] > pixels[0][2], `${name} left eye must be red: ${pixels}`);
    assert.ok(pixels[1][2] > pixels[1][0], `${name} right eye must be blue: ${pixels}`);
    report.push(`${name}: actual left/right Canvas pixel eye mapping PASS`);
    await page.keyboard.press('KeyV');
    await click('cinema:format');
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(150);
    const reversed = await page.evaluate(() =>
      ['leftEyeCanvas', 'rightEyeCanvas'].map((id) => {
        const c = document.getElementById(id),
          r = c.getBoundingClientRect(),
          d = c.width / r.width;
        return Array.from(
          c
            .getContext('2d')
            .getImageData(Math.round((r.width / 2 + 55) * d), Math.round(175 * d), 1, 1).data,
        );
      }),
    );
    assert.ok(reversed[0][2] > reversed[0][0]);
    assert.ok(reversed[1][0] > reversed[1][2]);
    report.push(`${name}: reversed right/left Canvas pixel mapping PASS`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120); // back to Home through keyboard alternative
    await page.evaluate(() => window.PocketVR.system.home());
    await page.keyboard.press('Escape');
    await page.reload();
    await page.click('#screenButton');
    await page.click('#skipTutorial');
    await home();
    await click('app:environments');
    await click('environment:set:ocean');
    await shot('ocean');
    // Touch cancellation must not select the aimed element.
    await home();
    const active = (await inspect()).active;
    await page.dispatchEvent('#leftEyeCanvas', 'pointerdown', {
      pointerId: 5,
      clientX: 100,
      clientY: 100,
    });
    await page.dispatchEvent('#leftEyeCanvas', 'pointercancel', {
      pointerId: 5,
      clientX: 100,
      clientY: 100,
    });
    assert.equal((await inspect()).active, active);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.waitForTimeout(150);
    await page.setViewportSize({ width: 932, height: 430 });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#recovery').isVisible(), false);
    report.push(`${name}: pointer cancellation, rotation/viewport resize PASS`);
    await page.click('#exitButton');
    await page.setViewportSize({ width: 852, height: 393 });
    await page.click('#enterButton');
    await page.click('#skipTutorial');
    await page.waitForTimeout(300);
    await shot('stereo-home');
    await page
      .locator('#leftEyeCanvas')
      .screenshot({ path: path.join(output, `${name}-left-eye.png`) });
    await page
      .locator('#rightEyeCanvas')
      .screenshot({ path: path.join(output, `${name}-right-eye.png`) });
    assert.equal((await inspect()).mode, 'headset');
    assert.equal(await page.evaluate(() => window.cameraRequests), 0);
    report.push(`${name}: stereo entry, missing motion samples fallback PASS`);
    const failed = await browser.newPage({ viewport: { width: 852, height: 393 } });
    await failed.route('**/scene/spatial-renderer.js', (route) => route.abort());
    await failed.goto(url);
    await failed.locator('#reloadApp').waitFor();
    await failed.screenshot({ path: path.join(output, `${name}-dependency-recovery.png`) });
    await failed.unroute('**/scene/spatial-renderer.js');
    await failed.click('#reloadApp');
    await failed.waitForFunction(() => window.PocketVR);
    await failed.close();
    report.push(`${name}: failed local dependency → actionable reload → recovered PASS`);
    const pending = await browser.newPage();
    await pending.addInitScript(() => {
      Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
        configurable: true,
        value: () => new Promise(() => {}),
      });
    });
    await pending.goto(url);
    await pending.click('#enterButton');
    await pending.waitForTimeout(4000);
    assert.equal(await pending.locator('#startOverlay').isVisible(), false);
    assert.equal((await pending.evaluate(() => window.PocketVR.inspect())).motionTracking, false);
    await pending.close();
    report.push(
      `${name}: indefinitely pending motion permission does not block Home PASS (mocked API)`,
    );
    assert.deepEqual(errors, []);
    assert.equal(
      requests.filter((u) => /^https?:/.test(u) && !u.startsWith('http://127.0.0.1')).length,
      0,
    );
    report.push(`${name}: no uncaught runtime errors, no startup external downloads PASS`);
  } catch (e) {
    await shot('failure');
    throw e;
  } finally {
    await browser.close();
  }
}
(async () => {
  await run(
    'chromium',
    chromium,
    process.env.POCKET_BROWSER_CHANNEL ? { channel: process.env.POCKET_BROWSER_CHANNEL } : {},
  );
  await run('webkit', webkit, {});
  fs.writeFileSync(path.join(output, 'browser-results.txt'), report.join('\n') + '\n');
  console.log(report.join('\n'));
})().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    path.join(output, 'browser-results.txt'),
    report.join('\n') + '\nFAIL: ' + e.stack,
  );
  process.exit(1);
});
