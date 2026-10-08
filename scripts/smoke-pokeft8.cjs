'use strict';

// Real Electron + emulator verification. ROMs and game screenshots stay local.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dgram = require('node:dgram');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { _electron: electron } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const profileName = 'pokeft8-smoke-' + Date.now();
const packaged = process.env.POKEFT8_EXECUTABLE;
const label = packaged ? 'packaged' : 'source';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
fs.mkdirSync(artifacts, { recursive: true });

async function waitStatus(page, predicate, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let state;
  while (Date.now() < deadline) {
    state = await page.evaluate(() =>
      window.require('electron').ipcRenderer.invoke('pokeft8:get-state'),
    );
    if (state.error) throw new Error(state.error);
    if (predicate(state)) return state;
    await page.waitForTimeout(100);
  }
  throw new Error(
    'PokeFT8 state timeout: ' + JSON.stringify({ ...state, frame: Boolean(state.frame) }),
  );
}

async function freePort() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function main() {
  const errors = [];
  const report = { label, checks: [], rendererErrors: errors };
  let app, page, profile, expectedProfile;
  try {
    app = await electron.launch({
      ...(packaged ? { executablePath: packaged } : {}),
      args: [...(packaged ? [] : [root]), '--gt-name=' + profileName, '--disable-auto-updates'],
      env,
      cwd: root,
      timeout: 30000,
    });
    const paths = await app.evaluate(({ app }) => ({
      profile: app.getPath('userData'),
      appData: app.getPath('appData'),
    }));
    profile = paths.profile;
    expectedProfile = path.join(paths.appData, 'GridTracker2-PokeFT8 - ' + profileName);
    assert.equal(profile, expectedProfile);
    page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.stack || error.message));
    await page.waitForFunction(
      () => window.PokeFT8 && typeof GT !== 'undefined' && GT.finishedLoading,
      null,
      { timeout: 30000 },
    );
    await page.locator('#pokeft8Button').click();
    await page.locator('#pokeft8Dock').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#pokeft8Watts').inputValue(), '50');
    assert.equal(await page.locator('#pokeft8Button').getAttribute('aria-expanded'), 'true');
    await page.screenshot({ path: path.join(artifacts, label + '-dock.png') });
    report.checks.push('main-window dock and default power');
    for (const size of [
      [860, 652],
      [520, 500],
      [360, 600],
      [217, 398],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, dimensions) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().endsWith('/GridTracker2.html'))
            .setContentSize(...dimensions),
        size,
      );
      await page.waitForTimeout(100);
      const bounds = await page.evaluate(() => {
        const r = document.getElementById('pokeft8Dock').getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          viewport: innerWidth,
          height: innerHeight,
        };
      });
      assert.ok(
        bounds.left >= 0 &&
          bounds.right <= bounds.viewport + 1 &&
          bounds.top >= 0 &&
          bounds.bottom <= bounds.height + 1,
        JSON.stringify(bounds),
      );
      assert.ok(bounds.width >= Math.min(200, size[0] - 12), JSON.stringify(bounds));
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('/GridTracker2.html'))
        .setContentSize(1100, 820),
    );
    report.checks.push('containment at four sizes including upstream minimum');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pokeft8Dock').isVisible(), false);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
    assert.equal(await page.locator('#pokeft8Dock').isVisible(), true);
    report.checks.push('keyboard open/close');

    if (process.env.POKEFT8_ROM) {
      const rom = path.resolve(process.env.POKEFT8_ROM);
      const hash = () => crypto.createHash('sha1').update(fs.readFileSync(rom)).digest('hex');
      const original = hash();
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, rom);
      await page.locator('#pokeft8Rom').click();
      await waitStatus(page, (s) => Boolean(s.romName));
      await page.locator('#pokeft8Demo').click();
      await waitStatus(page, (s) => s.running && Boolean(s.frame), 45000);
      await page.locator('#pokeft8Frame').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#pokeft8Frame').evaluate((img) => img.naturalWidth), 160);
      console.log(label + ': real Game Boy frames received');
      report.checks.push('selected local ROM and real 160x144 emulator frames');
      await page.locator('#pokeft8Pause').click();
      await waitStatus(page, (s) => s.status.paused === true);
      // Let the final frame already in the IPC pipe arrive after the pause status.
      await page.waitForTimeout(300);
      const paused = await page.locator('#pokeft8Frame').getAttribute('src');
      await page.waitForTimeout(500);
      assert.ok(
        (await page.locator('#pokeft8Frame').getAttribute('src')) === paused,
        'Paused emulator frame changed',
      );
      await page.locator('#pokeft8Watts').fill('75');
      await page.locator('#pokeft8Watts').press('Enter');
      await waitStatus(page, (s) => s.status.watts === 75);
      const settings = JSON.parse(
        fs.readFileSync(path.join(profile, 'PokeFT8/settings.json'), 'utf8'),
      );
      assert.equal(settings.romPath, rom);
      assert.equal(settings.watts, 75);
      await page.locator('#pokeft8Sound').check();
      await waitStatus(page, (s) => s.status.sound === true);
      await page.locator('#pokeft8Sound').uncheck();
      await waitStatus(page, (s) => s.status.sound === false);
      await page.locator('#pokeft8Pause').click();
      report.checks.push('pause freezes screen; power keeps ROM selection; audio on/off');

      if (process.env.POKEFT8_QUICK !== '1') {
        await waitStatus(page, (s) => s.status.opponent === 'JA1ABC', 45000);
        await waitStatus(page, (s) => s.status.elapsed >= 40, 20000);
        await page.screenshot({ path: path.join(artifacts, label + '-battle.png') });
        console.log(label + ': encounter JA1ABC; waiting for full FT8 demo capture');
        const captured = await waitStatus(
          page,
          (s) => s.status.game_state === 'victory' && s.status.collection?.length === 1,
          150000,
        );
        assert.equal(captured.status.collection[0].call, 'JA1ABC');
        assert.equal(captured.status.bad_packets, 0);
        await waitStatus(page, (s) => s.status.elapsed >= 130, 30000);
        await page.locator('#pokeft8CollectionDetails').evaluate((details) => {
          details.open = true;
        });
        await page.screenshot({ path: path.join(artifacts, label + '-capture.png') });
        report.demoCapture = captured.status.collection[0];
        report.checks.push('full demo reaches native Poke Ball capture/victory');
        console.log(label + ': full demo captured JA1ABC');
      }

      await page.locator('#pokeft8Live').click();
      await waitStatus(page, (s) => s.status.mode === 'live');
      const port = await freePort();
      await page.evaluate((udpPort) => {
        GT.settings.app.wsjtUdpPort = udpPort;
        GT.settings.app.wsjtIP = '';
        multicastEnable.checked = false;
        updateWsjtxListener(udpPort);
      }, port);
      await page.waitForFunction(() => GT.wsjtUdpSocketReady, null, { timeout: 5000 });
      const python =
        process.env.POKEFT8_PYTHON ||
        path.join(
          root,
          'pokeft8/.venv',
          process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
        );
      const fixture = spawnSync(
        python,
        [
          '-c',
          'import base64,json,sys; sys.path.insert(0,"pokeft8"); from demo import real_sequence; import protocol as w; packets=[w.header(12)+w.string("<ADIF_VER:5>3.1.0<EOH>"+p[len(w.header(12))+4:].decode().replace("<EOR>","<BAND:3>20m<EOR>")) if w.decode(p)["type"]=="logged" else p for _,p in real_sequence()]; print(json.dumps([base64.b64encode(p).decode() for p in packets]))',
        ],
        { cwd: root, encoding: 'utf8' },
      );
      assert.equal(fixture.status, 0, fixture.stderr);
      const sender = dgram.createSocket('udp4');
      try {
        for (const packet of JSON.parse(fixture.stdout)) {
          await new Promise((resolve, reject) =>
            sender.send(Buffer.from(packet, 'base64'), port, '127.0.0.1', (error) =>
              error ? reject(error) : resolve(),
            ),
          );
          await page.waitForTimeout(100);
        }
      } finally {
        sender.close();
      }
      const live = await waitStatus(page, (s) => s.status.collection?.length === 1, 15000);
      assert.ok(live.status.packet_count >= 15);
      assert.equal(live.status.collection[0].call, 'JA1ABC');
      assert.equal(live.status.bad_packets, 0);
      assert.ok(await page.evaluate(() => Object.keys(GT.instances).length > 0));
      assert.ok(
        await page.evaluate(() =>
          Object.values(GT.QSOhash).some((qso) => qso.DEcall === 'JA1ABC'),
        ),
        'GridTracker retains normal QSO logging',
      );
      report.checks.push('GridTracker UDP receiver forwards live packets and persists capture');
      await page.locator('#pokeft8Stop').click();
      await waitStatus(page, (s) => !s.running && !s.starting);
      await page.locator('#pokeft8Live').click();
      await waitStatus(page, (s) => s.running && s.status.collection?.length === 1);
      report.checks.push('stop/start restores live collection');
      await page.screenshot({ path: path.join(artifacts, label + '-live.png') });
      assert.equal(hash(), original);
      report.checks.push('ROM checksum unchanged');
    }
    assert.equal(errors.length, 0, 'Renderer errors: ' + errors.join('\n'));
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = error.stack;
    if (page)
      await page
        .screenshot({ path: path.join(artifacts, label + '-failure.png') })
        .catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(artifacts, label + '-smoke.json'), JSON.stringify(report, null, 2));
    if (app) await app.close();
    // Verify the exact target before recursively removing this test's profile.
    if (
      profile === expectedProfile &&
      profile &&
      path.basename(profile) === 'GridTracker2-PokeFT8 - ' + profileName
    )
      fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
