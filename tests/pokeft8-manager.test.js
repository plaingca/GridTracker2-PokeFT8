'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  PokeFT8Manager,
  validateCommand,
  sanitizeStatus,
  MAX_QUEUED_PACKETS,
  MAX_QUEUE_BYTES,
} = require('../src/main/pokeft8');

function fakeChild() {
  const child = new EventEmitter();
  child.writes = [];
  child.killed = false;
  child.closed = false;
  child.autoShutdown = true;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = child.stderr.setEncoding = () => {};
  child.stdin = new EventEmitter();
  child.stdin.acceptWrites = true;
  child.stdin.write = (line) => {
    child.writes.push(JSON.parse(line));
    if (JSON.parse(line).command === 'shutdown' && child.autoShutdown)
      setImmediate(() => child.close(0));
    return child.stdin.acceptWrites;
  };
  child.close = (code = 0, signal = null) => {
    if (child.closed) return;
    child.closed = true;
    child.emit('close', code, signal);
  };
  child.kill = () => {
    child.killed = true;
    setImmediate(() => child.close(null, 'SIGTERM'));
    return true;
  };
  child.output = (message) => child.stdout.emit('data', JSON.stringify(message) + '\n');
  return child;
}

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeft8-manager-'));
  const rom = path.join(root, 'Pokemon.gb');
  fs.writeFileSync(rom, Buffer.alloc(32768));
  const sends = [];
  const webContents = {
    isDestroyed: () => false,
    send: (channel, message) => sends.push({ channel, message }),
  };
  const window = { isDestroyed: () => false, webContents };
  const ipcMain = new EventEmitter();
  ipcMain.handlers = new Map();
  ipcMain.handle = (channel, handler) => ipcMain.handlers.set(channel, handler);
  ipcMain.removeHandler = (channel) => ipcMain.handlers.delete(channel);
  const children = [];
  const spawnCalls = [];
  let pickerResult = { canceled: false, filePaths: [rom] };
  const manager = new PokeFT8Manager({
    app: { isPackaged: options.packaged || false, getPath: () => root, getAppPath: () => root },
    ipcMain,
    dialog: { showOpenDialog: async () => pickerResult },
    getWindow: () => window,
    platform: 'win32',
    env: { POKEFT8_PYTHON: 'python-test.exe' },
    resourcesPath: root,
    startupTimeoutMs: 30,
    shutdownTimeoutMs: 10,
    spawn: (...args) => {
      spawnCalls.push(args);
      const child = fakeChild();
      children.push(child);
      return child;
    },
  });
  // The real Electron event loop owns sockets/windows. Keep mocked async tests alive.
  const keepAlive = setInterval(() => {}, 1000);
  t.after(async () => {
    await manager.dispose();
    clearInterval(keepAlive);
    fs.rmSync(root, { recursive: true, force: true });
  });
  manager.state.romPath = rom;
  manager.state.romName = 'Pokemon.gb';
  return {
    manager,
    root,
    rom,
    ipcMain,
    children,
    spawnCalls,
    sends,
    window,
    setPicker: (result) => {
      pickerResult = result;
    },
    async start(mode = 'demo') {
      const pending = manager.start({ mode });
      children.at(-1).output({ type: 'ready', protocol: 1, running: true });
      return await pending;
    },
  };
}

test('command validation restricts executable controls and finite power values', () => {
  assert.deepEqual(validateCommand({ command: 'sound', enabled: true, extra: 'ignored' }), {
    command: 'sound',
    enabled: true,
  });
  assert.deepEqual(validateCommand({ command: 'power', watts: 1500 }), {
    command: 'power',
    watts: 1500,
  });
  for (const input of [
    null,
    [],
    { command: 'shutdown' },
    { command: 'packet', data: 'AA==' },
    { command: 'mode', mode: 'shell' },
    { command: 'pause', paused: 1 },
    ...[0, -1, 1501, NaN, Infinity, '50'].map((watts) => ({ command: 'power', watts })),
  ]) {
    assert.throws(() => validateCommand(input));
  }
});

test('worker startup is ready-gated and passes ROM/save paths without a shell', async (t) => {
  const f = fixture(t);
  const starting = f.manager.start({ mode: 'live' });
  assert.equal(f.manager.state.starting, true);
  assert.equal(f.manager.state.running, false);
  assert.equal(f.manager.packet('AA=='), false);
  const [file, args, options] = f.spawnCalls[0];
  assert.equal(file, 'python-test.exe');
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(args[args.indexOf('--rom') + 1], f.rom);
  assert.equal(args[args.indexOf('--data-dir') + 1], path.join(f.root, 'PokeFT8'));
  f.children[0].output({ type: 'ready', protocol: 1, running: true });
  const state = await starting;
  assert.equal(state.running, true);
  assert.equal(state.starting, false);
  assert.deepEqual(f.children[0].writes.slice(0, 2), [
    { command: 'power', watts: 50 },
    { command: 'sound', enabled: false },
  ]);
  assert.equal(f.manager.packet('AA=='), true);
  assert.deepEqual(f.children[0].writes.at(-1), { command: 'packet', data: 'AA==' });
});

test('split protocol lines, status and PNG frames reach only the main window', async (t) => {
  const f = fixture(t);
  await f.start();
  const message = JSON.stringify({
    type: 'status',
    mode: 'demo',
    state: 'IDLE',
    collection: [{ call: 'VA7TEST' }],
    unsafe: 'excluded',
  });
  f.children[0].stdout.emit('data', message.slice(0, 17));
  assert.equal(f.manager.state.status.state, undefined);
  f.children[0].stdout.emit('data', message.slice(17) + '\n');
  assert.equal(f.manager.state.status.state, 'IDLE');
  assert.equal(f.manager.state.status.unsafe, undefined);
  f.children[0].output({ type: 'frame', png: 'iVBORw0KGgo=', width: 160, height: 144 });
  assert.equal(f.manager.snapshot().frame.png, 'iVBORw0KGgo=');
  assert.equal(f.sends.at(-1).channel, 'pokeft8:update');
  assert.equal(f.sends.at(-1).message.type, 'frame');
});

test('packets use bounded backpressure and stop immediately in demo mode', async (t) => {
  const f = fixture(t);
  await f.start('live');
  const child = f.children[0];
  child.stdin.acceptWrites = false;
  assert.equal(f.manager.packet('AA=='), true);
  for (let i = 0; i < 1000; i++) f.manager.packet('AA==');
  assert.equal(f.manager.queue.filter((entry) => entry.packet).length, MAX_QUEUED_PACKETS);
  assert.ok(f.manager.queueBytes <= MAX_QUEUE_BYTES);
  assert.equal(f.manager.state.droppedPackets, 1000 - MAX_QUEUED_PACKETS);
  f.manager.command({ command: 'mode', mode: 'demo' });
  assert.equal(f.manager.packet('AA=='), false);
  assert.equal(f.manager.queue.filter((entry) => entry.packet).length, 0);
  child.stdin.acceptWrites = true;
  child.stdin.emit('drain');
  assert.deepEqual(child.writes.at(-1), { command: 'mode', mode: 'demo' });
  assert.equal(f.manager.queue.length, 0);
});

test('large packets are bounded by queue bytes as well as count', async (t) => {
  const f = fixture(t);
  await f.start('live');
  const packet = Buffer.alloc(65507).toString('base64');
  f.children[0].stdin.acceptWrites = false;
  f.manager.packet(packet);
  for (let i = 0; i < 20; i++) f.manager.packet(packet);
  assert.ok(f.manager.queueBytes <= MAX_QUEUE_BYTES);
  assert.ok(f.manager.queue.length < 10);
  assert.ok(f.manager.state.droppedPackets > 0);
  assert.equal(f.manager.packet(Buffer.alloc(65508).toString('base64')), false);
  assert.equal(f.manager.packet('not base64!'), false);
});

test('commands remain bounded when worker stops consuming stdin', async (t) => {
  const f = fixture(t);
  await f.start();
  f.children[0].stdin.acceptWrites = false;
  f.manager.command({ command: 'power', watts: 5 });
  for (let i = 0; i < 32; i++) f.manager.command({ command: 'power', watts: 5 });
  assert.throws(() => f.manager.command({ command: 'power', watts: 50 }), /busy/);
  assert.equal(f.manager.state.watts, 5);
});

test('graceful stop and restart use the same ROM and preserve watts', async (t) => {
  const f = fixture(t);
  await f.start();
  f.manager.command({ command: 'power', watts: 25 });
  f.manager.command({ command: 'restart' });
  assert.deepEqual(f.children[0].writes.at(-1), { command: 'restart' });
  const stopped = await f.manager.stop();
  assert.equal(stopped.running, false);
  assert.equal(f.children[0].killed, false);
  assert.deepEqual(f.children[0].writes.at(-1), { command: 'shutdown' });
  await f.start('live');
  assert.equal(f.children.length, 2);
  assert.equal(f.children[1].writes[0].watts, 25);
  assert.equal(f.spawnCalls[1][1][f.spawnCalls[1][1].indexOf('--rom') + 1], f.rom);
  assert.throws(() => f.manager.command({ command: 'pause', paused: true }), /demo/);
});

test('startup timeout rejects, kills the stalled worker, and permits a later start', async (t) => {
  const f = fixture(t);
  const pending = f.manager.start();
  f.children[0].autoShutdown = false;
  await assert.rejects(pending, /did not become ready/);
  await f.manager.stop();
  assert.equal(f.children[0].killed, true);
  assert.match(f.manager.state.error, /did not become ready/);
  await f.start();
  assert.equal(f.manager.state.running, true);
  assert.equal(f.manager.state.error, '');
});

test('startup rejects incompatible handshake and malformed options', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.manager.start(null), /options must be an object/);
  const pending = f.manager.start();
  f.children[0].output({ type: 'ready', protocol: 2, running: true });
  await assert.rejects(pending, /supported protocol/);
  await f.manager.stop();
  assert.equal(f.manager.state.running, false);
});

test('crash diagnostics are bounded and running state is cleared', async (t) => {
  const f = fixture(t);
  await f.start();
  f.children[0].stderr.emit('data', 'x'.repeat(100000) + '\nengine failed');
  f.children[0].close(7);
  assert.equal(f.manager.state.running, false);
  assert.equal(f.manager.child, null);
  assert.ok(f.manager.stderr.length <= 16 * 1024);
  assert.match(f.manager.state.error, /engine failed/);
  assert.ok(f.manager.state.error.length < 4096);
});

test('invalid or oversized output fails safely and shuts down the child', async (t) => {
  const f = fixture(t);
  await f.start();
  f.children[0].stdout.emit('data', 'x'.repeat(512 * 1024 + 1));
  assert.match(f.manager.state.error, /protocol limit/);
  assert.equal(f.manager.state.running, false);
  assert.equal(f.manager.stdout.length, 0);
  await f.manager.stop();
  await f.start();
  f.children[1].stdout.emit('data', '{not-json}\n');
  assert.match(f.manager.state.error, /invalid JSON/);
});

test('ROM selection cancellation preserves the running engine and replacement stops it', async (t) => {
  const f = fixture(t);
  await f.start();
  f.setPicker({ canceled: true, filePaths: [] });
  const canceled = await f.manager.selectRom();
  assert.equal(canceled.running, true);
  assert.equal(canceled.romPath, f.rom);
  const otherRom = path.join(f.root, 'Other.gb');
  fs.writeFileSync(otherRom, Buffer.alloc(32768));
  f.setPicker({ canceled: false, filePaths: [otherRom] });
  const selected = await f.manager.selectRom();
  assert.equal(selected.running, false);
  assert.equal(selected.romPath, otherRom);
  assert.equal(JSON.parse(fs.readFileSync(f.manager.configPath)).romPath, otherRom);
});

test('IPC enforces main-window ownership and disposal unregisters handlers', async (t) => {
  const f = fixture(t);
  f.manager.register();
  const getState = f.ipcMain.handlers.get('pokeft8:get-state');
  await assert.rejects(getState({ sender: {} }), /main GridTracker window/);
  assert.equal((await getState({ sender: f.window.webContents })).watts, 50);
  await f.start('live');
  const count = f.children[0].writes.length;
  f.ipcMain.emit('pokeft8:packet', { sender: {} }, 'AA==');
  assert.equal(f.children[0].writes.length, count);
  f.ipcMain.emit('pokeft8:packet', { sender: f.window.webContents }, 'AA==');
  assert.equal(f.children[0].writes.length, count + 1);
  await f.manager.dispose();
  assert.equal(f.ipcMain.handlers.size, 0);
  assert.equal(f.ipcMain.listenerCount('pokeft8:packet'), 0);
});

test('corrupt and invalid persisted configuration restores validated defaults and mutes sound', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    f.manager.configPath,
    JSON.stringify({ romPath: 'relative.gb', watts: -5, sound: true, mode: 'invalid' }),
  );
  f.manager.state.romPath = '';
  f.manager.loadConfig();
  assert.equal(f.manager.state.romPath, '');
  assert.equal(f.manager.state.watts, 50);
  assert.equal(f.manager.state.sound, false);
  assert.equal(f.manager.state.mode, 'demo');
  fs.writeFileSync(f.manager.configPath, '{broken json');
  f.manager.loadConfig();
  assert.match(f.manager.state.error, /defaults/);
  assert.throws(
    () => f.manager.validateRom(path.join(f.root, 'missing.gb')),
    /could not be found/,
  );
  assert.throws(() => f.manager.validateRom(path.join(f.root, 'script.exe')), /\.gb/);
});

test('packaged launch selects the frozen bundled executable', async (t) => {
  const f = fixture(t, { packaged: true });
  // Electron's packaged app path is a virtual archive, never a valid child cwd.
  const archive = path.join(f.root, 'app.asar');
  fs.writeFileSync(archive, 'virtual application archive');
  f.manager.app.getAppPath = () => archive;
  fs.mkdirSync(path.join(f.root, 'pokeft8'), { recursive: true });
  fs.writeFileSync(path.join(f.root, 'pokeft8', 'PokeFT8Bridge.exe'), 'fixture');
  await f.start();
  assert.equal(f.spawnCalls[0][0], path.join(f.root, 'pokeft8', 'PokeFT8Bridge.exe'));
  assert.equal(f.spawnCalls[0][1][0], '--rom');
  assert.equal(f.spawnCalls[0][2].cwd, path.dirname(f.spawnCalls[0][0]));
  assert.equal(fs.statSync(f.spawnCalls[0][2].cwd).isDirectory(), true);
  assert.notEqual(f.spawnCalls[0][2].cwd, archive);
});

test('status sanitizer bounds collection and excludes non-finite values', () => {
  const status = sanitizeStatus({
    type: 'status',
    collection: Array(600).fill({ call: 'TEST' }),
    message: 'x'.repeat(5000),
    frequency: Infinity,
    extra: true,
  });
  assert.equal(status.collection.length, 500);
  assert.equal(status.message.length, 4096);
  assert.equal(status.frequency, undefined);
  assert.equal(status.extra, undefined);
});
