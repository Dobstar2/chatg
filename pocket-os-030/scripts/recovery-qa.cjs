const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.POCKET_QA_OUTPUT || 'test-results';
(async () => {
  const report = [];
  for (const [name, type] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const b = await type.launch({
      headless: true,
      ...(name === 'chromium' && process.env.POCKET_BROWSER_CHANNEL
        ? { channel: process.env.POCKET_BROWSER_CHANNEL }
        : {}),
    });
    const p = await b.newPage({ viewport: { width: 852, height: 393 } });
    let errors = [],
      failed = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('requestfailed', (r) => failed.push(r.url()));
    await p.goto('http://127.0.0.1:8088/pocket-os-030/dist/pocket-os-030/?qa=1');
    await p.click('#screenButton');
    await p.click('#skipTutorial');
    assert.equal(await p.evaluate(() => window.PocketVR.version), 'pocket-vr-1.0.0-rc.1');
    assert.equal(await p.evaluate(() => !!navigator.serviceWorker?.controller), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    await p.screenshot({ path: path.join(out, `${name}-nested-build.png`) });
    report.push(
      `${name}: built artifact nested-path cold load, relative modules/assets, RC identity, no worker interception PASS`,
    );
    if (name === 'chromium') {
      await p.goto('http://127.0.0.1:8088/pocket-os-030/?qa=1');
      await p.click('#screenButton');
      await p.click('#skipTutorial');
      await p.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext('2d');
        setInterval(() => {
          ctx.fillStyle = '#345';
          ctx.fillRect(0, 0, 64, 64);
        }, 60);
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: {
            getUserMedia: async () => {
              window.qaStream = c.captureStream(15);
              return window.qaStream;
            },
          },
        });
      });
      let blocked = 0;
      await p.route('https://cdn.jsdelivr.net/**', (r) => {
        blocked++;
        r.abort();
      });
      async function click(id) {
        await p.waitForTimeout(130);
        const t = await p.evaluate(
          (id) => window.PocketVR.inspect().targets.find((t) => t.id === id),
          id,
        );
        assert.ok(t, id);
        await p.mouse.click(t.x, t.y);
      }
      await click('app:quick-settings');
      await click('settings:camera');
      await p.click('#trustedAction');
      await p.waitForFunction(
        () => window.qaStream && window.qaStream.getTracks().every((t) => t.readyState === 'ended'),
        {},
        { timeout: 15000 },
      );
      assert.ok(blocked > 0);
      assert.equal(await p.evaluate(() => window.PocketVR.inspect().running), true);
      await p.screenshot({ path: path.join(out, 'chromium-optional-tracking-failure.png') });
      report.push(
        'chromium: deliberately blocked optional MediaPipe dependency releases mock camera and keeps navigation running PASS (mock stream)',
      );
    }
    await b.close();
  }
  fs.writeFileSync(path.join(out, 'recovery-results.txt'), report.join('\n') + '\n');
  console.log(report.join('\n'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
