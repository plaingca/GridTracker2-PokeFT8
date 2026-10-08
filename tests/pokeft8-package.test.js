'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Arch } = require('builder-util');
const verify = require('../scripts/verify-pokeft8-package.cjs');

const REPORT = {
  type: 'self-test',
  protocol: 1,
  ok: true,
  symbols_verified: true,
  width: 160,
  height: 144,
};

function pe(machine = 0x8664) {
  const buffer = Buffer.alloc(134);
  buffer.write('MZ');
  buffer.writeUInt32LE(128, 0x3c);
  buffer.writeUInt32LE(0x00004550, 128);
  buffer.writeUInt16LE(machine, 132);
  return buffer;
}

function elf(machine = 62, bigEndian = false) {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(buffer);
  buffer[4] = machine === 62 || machine === 183 ? 2 : 1;
  buffer[5] = bigEndian ? 2 : 1;
  if (bigEndian) buffer.writeUInt16BE(machine, 18);
  else buffer.writeUInt16LE(machine, 18);
  return buffer;
}

function macho(cpu = 0x01000007, bigEndian = false) {
  const buffer = Buffer.alloc(64);
  const magic = cpu & 0x01000000 ? 0xfeedfacf : 0xfeedface;
  if (bigEndian) {
    buffer.writeUInt32BE(magic, 0);
    buffer.writeUInt32BE(cpu, 4);
  } else {
    buffer.writeUInt32LE(magic, 0);
    buffer.writeUInt32LE(cpu, 4);
  }
  return buffer;
}

function fixture(t, platform = 'win32', arch = 'x64') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeft8-package-'));
  const bundle = path.join(root, 'pokeft8', 'dist', 'PokeFT8Bridge');
  const executable = path.join(
    bundle,
    platform === 'win32' ? 'PokeFT8Bridge.exe' : 'PokeFT8Bridge',
  );
  const calls = [];
  const context = {
    electronPlatformName: platform,
    arch: Arch[arch],
    packager: { projectDir: root },
  };
  const dependencies = {
    platform,
    arch: arch === 'armv7l' ? 'arm' : arch,
    execute: async (...args) => {
      calls.push(args);
      return { stdout: JSON.stringify(REPORT), stderr: '' };
    },
  };
  t.after(() => {
    assert.ok(path.isAbsolute(root) && path.basename(root).startsWith('pokeft8-package-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    bundle,
    executable,
    context,
    dependencies,
    calls,
    writeWorker(buffer = platform === 'win32' ? pe() : platform === 'linux' ? elf() : macho()) {
      fs.mkdirSync(bundle, { recursive: true });
      fs.writeFileSync(executable, buffer, { mode: 0o755 });
    },
  };
}

test('builder hook has a default export', () => {
  assert.equal(verify.default, verify);
});

test('missing bundle and missing executable stop packaging before running a process', async (t) => {
  const f = fixture(t);
  await assert.rejects(verify(f.context, f.dependencies), /worker is missing/);
  fs.mkdirSync(f.bundle, { recursive: true });
  await assert.rejects(verify(f.context, f.dependencies), /worker is missing/);
  assert.equal(f.calls.length, 0);
});

test('platform and builder architecture must match the native host', async (t) => {
  const f = fixture(t);
  f.writeWorker();
  await assert.rejects(
    verify({ ...f.context, electronPlatformName: 'linux' }, f.dependencies),
    /Build PokeFT8 natively on linux\/x64/,
  );
  await assert.rejects(verify({ ...f.context, arch: Arch.arm64 }, f.dependencies), /win32\/arm64/);
  await assert.rejects(verify({ ...f.context, arch: Arch.universal }, f.dependencies), /native/);
  await assert.rejects(
    verify({ ...f.context, arch: 'x64' }, f.dependencies),
    /recognized electron-builder architecture/,
  );
  assert.equal(f.calls.length, 0);
});

test('valid worker uses a hidden shell-free bounded self-test and leaves source intact', async (t) => {
  const f = fixture(t);
  f.writeWorker();
  const before = fs.readFileSync(f.executable);
  await verify(f.context, f.dependencies);
  assert.equal(f.calls.length, 1);
  const [executable, args, options] = f.calls[0];
  assert.equal(executable, f.executable);
  assert.deepEqual(args, ['--self-test']);
  assert.equal(options.cwd, f.root);
  assert.equal(options.timeout, 90000);
  assert.equal(options.maxBuffer, 1024 * 1024);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(fs.readFileSync(f.executable), before);
});

test('actual executable platform and architecture reject stale worker bundles', async (t) => {
  const f = fixture(t);
  f.writeWorker(pe(0x014c));
  await assert.rejects(verify(f.context, f.dependencies), /worker is win32\/ia32/);
  f.writeWorker(elf());
  await assert.rejects(verify(f.context, f.dependencies), /worker is linux\/x64/);
  f.writeWorker(Buffer.alloc(64));
  await assert.rejects(verify(f.context, f.dependencies), /unsupported binary format/);
  assert.equal(f.calls.length, 0);
});

test('native ARM host names are mapped to builder-util architecture names', async (t) => {
  const f = fixture(t, 'linux', 'armv7l');
  f.writeWorker(elf(40));
  await verify(f.context, f.dependencies);
  assert.equal(f.calls.length, 1);
});

test('PE, ELF and Mach-O headers report their real native architecture', (t) => {
  const f = fixture(t);
  const examples = [
    [pe(), 'win32', 'x64'],
    [pe(0xaa64), 'win32', 'arm64'],
    [pe(0x014c), 'win32', 'ia32'],
    [elf(), 'linux', 'x64'],
    [elf(183), 'linux', 'arm64'],
    [elf(3), 'linux', 'ia32'],
    [elf(40, true), 'linux', 'armv7l'],
    [macho(), 'darwin', 'x64'],
    [macho(0x0100000c), 'darwin', 'arm64'],
    [macho(7, true), 'darwin', 'ia32'],
  ];
  for (const [buffer, platform, arch] of examples) {
    f.writeWorker(buffer);
    assert.deepEqual(verify.executableTarget(f.executable), { platform, arch });
  }
});

test('truncated and malformed executable headers fail instead of being treated as native', (t) => {
  const f = fixture(t);
  const invalidPE = pe();
  invalidPE.writeUInt32LE(0xffffffff, 0x3c);
  const invalidELF = elf();
  invalidELF[5] = 0;
  const universalMach = Buffer.alloc(64);
  universalMach.writeUInt32BE(0xcafebabe);
  for (const buffer of [Buffer.alloc(1), invalidPE, invalidELF, universalMach]) {
    f.writeWorker(buffer);
    assert.throws(() => verify.executableTarget(f.executable));
  }
});

test('self-test must return successful protocol JSON with verified native dependencies', async (t) => {
  const f = fixture(t);
  f.writeWorker();
  for (const report of [
    { ...REPORT, ok: false },
    { ...REPORT, ok: 'true' },
    { ...REPORT, protocol: 2 },
    { ...REPORT, type: 'ready' },
    { ...REPORT, symbols_verified: false },
    { ...REPORT, width: 161 },
    { ...REPORT, height: 0 },
    null,
  ]) {
    await assert.rejects(
      verify(f.context, {
        ...f.dependencies,
        execute: async () => ({ stdout: JSON.stringify(report) }),
      }),
      /did not verify/,
    );
  }
  await assert.rejects(
    verify(f.context, {
      ...f.dependencies,
      execute: async () => ({ stdout: 'native banner\n' + JSON.stringify(REPORT) }),
    }),
    /JSON report/,
  );
});

test('self-test process failure rejects packaging with bounded diagnostic output', async (t) => {
  const f = fixture(t);
  f.writeWorker();
  const failure = new Error('Command timed out');
  failure.stderr = 'x'.repeat(5000) + '\nNative module missing';
  await assert.rejects(
    verify(f.context, {
      ...f.dependencies,
      execute: async () => {
        throw failure;
      },
    }),
    (error) => {
      assert.match(error.message, /90-second limit/);
      assert.match(error.message, /Native module missing/);
      assert.ok(error.message.length < 2200);
      return true;
    },
  );
});

test('game, saves, databases, logs and environment files are rejected at any depth', (t) => {
  const f = fixture(t);
  const names = [
    'Pokemon.GB',
    'Pokemon.gbc',
    'game.sav',
    'game.ram',
    'bootstrap.state',
    'dex.sqlite',
    'dex.sqlite3',
    'game.log',
    '.env',
    '.ENV.LOCAL',
    'secrets.env',
    'dex.sqlite-wal',
    'dex.sqlite3-shm',
  ];
  for (const [index, name] of names.entries()) {
    const folder = path.join(f.root, 'content-' + index);
    const nested = path.join(folder, '_internal', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, name), 'private fixture');
    assert.throws(() => verify.checkBundleContents(folder), /forbidden/);
  }
});

test('content walk permits ordinary runtime assets and third-party license files', (t) => {
  const f = fixture(t);
  f.writeWorker();
  const nested = path.join(f.bundle, '_internal', 'reference');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'pokered.sym'), 'symbols');
  fs.writeFileSync(path.join(f.bundle, 'LICENSE'), 'license');
  fs.writeFileSync(path.join(f.bundle, 'icon.png'), 'asset');
  assert.doesNotThrow(() => verify.checkBundleContents(f.bundle));
});

test('bundle contamination rejects an otherwise successful frozen self-test', async (t) => {
  const f = fixture(t);
  f.writeWorker();
  fs.writeFileSync(path.join(f.bundle, '.env.production'), 'private fixture');
  await assert.rejects(verify(f.context, f.dependencies), /forbidden/);
  assert.equal(f.calls.length, 1);
});

test('directory junctions cannot pull private files from outside the bundle', (t) => {
  const f = fixture(t);
  f.writeWorker();
  const outside = path.join(f.root, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'private.txt'), 'private fixture');
  fs.symlinkSync(
    outside,
    path.join(f.bundle, 'external'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.throws(() => verify.checkBundleContents(f.bundle), /outside the worker folder/);
});

test('internal framework directory links are allowed without recursive cycles', (t) => {
  const f = fixture(t);
  f.writeWorker();
  const framework = path.join(f.bundle, 'framework', 'Versions', 'A');
  fs.mkdirSync(framework, { recursive: true });
  fs.writeFileSync(path.join(framework, 'SDL2'), 'native runtime');
  fs.symlinkSync(
    framework,
    path.join(f.bundle, 'framework', 'Versions', 'Current'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  fs.symlinkSync(
    f.bundle,
    path.join(framework, 'cycle'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.doesNotThrow(() => verify.checkBundleContents(f.bundle));
});

test(
  'native Unix executable permissions are required',
  { skip: process.platform === 'win32' },
  async (t) => {
    const f = fixture(t, 'linux');
    f.writeWorker();
    fs.chmodSync(f.executable, 0o600);
    await assert.rejects(verify(f.context, f.dependencies), /executable permissions/);
    assert.equal(f.calls.length, 0);
  },
);
