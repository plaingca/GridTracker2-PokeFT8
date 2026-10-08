'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Arch } = require('builder-util');

const execFileAsync = promisify(execFile);
const SELF_TEST_TIMEOUT_MS = 90000;
const FORBIDDEN_EXTENSIONS = new Set([
  '.gb',
  '.gbc',
  '.sav',
  '.ram',
  '.state',
  '.sqlite',
  '.sqlite3',
  '.log',
  '.env',
]);

function nativeArch(arch) {
  return arch === 'arm' ? 'armv7l' : arch;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function forbiddenName(filename) {
  const lower = filename.toLowerCase();
  return (
    lower.startsWith('.env') ||
    FORBIDDEN_EXTENSIONS.has(path.extname(lower)) ||
    /\.sqlite3?-(wal|shm)$/.test(lower)
  );
}

function checkBundleContents(bundle) {
  const root = fs.realpathSync(bundle);
  const visited = new Set();
  function visit(directory) {
    const canonical = fs.realpathSync(directory);
    if (!inside(root, canonical))
      throw new Error('PokeFT8 bundle contains a link outside the worker folder.');
    if (visited.has(canonical)) return;
    visited.add(canonical);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (forbiddenName(entry.name)) {
        throw new Error(
          'Game or private content is forbidden in the PokeFT8 package: ' +
            path.relative(bundle, filename),
        );
      }
      let stat = fs.lstatSync(filename);
      if (stat.isSymbolicLink()) {
        const resolved = fs.realpathSync(filename);
        if (!inside(root, resolved))
          throw new Error(
            'PokeFT8 bundle contains a link outside the worker folder: ' +
              path.relative(bundle, filename),
          );
        if (forbiddenName(path.basename(resolved)))
          throw new Error(
            'PokeFT8 bundle links to game or private content: ' + path.relative(bundle, filename),
          );
        stat = fs.statSync(filename);
      }
      if (stat.isDirectory()) visit(filename);
      else if (!stat.isFile())
        throw new Error(
          'PokeFT8 bundle contains an unsupported file: ' + path.relative(bundle, filename),
        );
    }
  }
  visit(bundle);
}

// Read only executable headers. Checking the actual binary catches stale bundles
// even when electron-builder and the current host use the same architecture.
function executableTarget(filename) {
  const descriptor = fs.openSync(filename, 'r');
  try {
    const header = Buffer.alloc(64);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    if (bytesRead < 20) throw new Error('The frozen PokeFT8 executable has a truncated header.');
    if (header[0] === 0x4d && header[1] === 0x5a) {
      if (bytesRead < 64)
        throw new Error('The frozen PokeFT8 executable has a truncated PE header.');
      const offset = header.readUInt32LE(0x3c);
      if (offset < 64 || offset > fs.fstatSync(descriptor).size - 6)
        throw new Error('The frozen PokeFT8 executable has an invalid PE header.');
      const pe = Buffer.alloc(6);
      if (fs.readSync(descriptor, pe, 0, 6, offset) !== 6 || pe.readUInt32LE(0) !== 0x00004550)
        throw new Error('The frozen PokeFT8 executable has an invalid PE signature.');
      const arch = { 0x014c: 'ia32', 0x8664: 'x64', 0x01c4: 'armv7l', 0xaa64: 'arm64' }[
        pe.readUInt16LE(4)
      ];
      if (!arch) throw new Error('The frozen PokeFT8 PE architecture is unsupported.');
      return { platform: 'win32', arch };
    }
    if (header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      if (header[5] !== 1 && header[5] !== 2)
        throw new Error('The frozen PokeFT8 executable has invalid ELF byte order.');
      const machine = header[5] === 1 ? header.readUInt16LE(18) : header.readUInt16BE(18);
      const arch = { 3: 'ia32', 62: 'x64', 40: 'armv7l', 183: 'arm64' }[machine];
      if (!arch || header[4] !== (arch === 'x64' || arch === 'arm64' ? 2 : 1))
        throw new Error('The frozen PokeFT8 ELF architecture is unsupported.');
      return { platform: 'linux', arch };
    }
    const magicLE = header.readUInt32LE(0);
    const magicBE = header.readUInt32BE(0);
    const littleEndian = magicLE === 0xfeedface || magicLE === 0xfeedfacf;
    if (littleEndian || magicBE === 0xfeedface || magicBE === 0xfeedfacf) {
      const cpu = littleEndian ? header.readUInt32LE(4) : header.readUInt32BE(4);
      const arch = { 7: 'ia32', 0x01000007: 'x64', 12: 'armv7l', 0x0100000c: 'arm64' }[cpu];
      if (!arch) throw new Error('The frozen PokeFT8 Mach-O architecture is unsupported.');
      return { platform: 'darwin', arch };
    }
    if ([0xcafebabe, 0xcafebabf, 0xbebafeca, 0xbfbafeca].includes(magicBE)) {
      throw new Error(
        'Build a native single-architecture PokeFT8 worker instead of a universal executable.',
      );
    }
    throw new Error('The frozen PokeFT8 executable has an unsupported binary format.');
  } finally {
    fs.closeSync(descriptor);
  }
}

async function selfTest(executable, projectDir, execute = execFileAsync) {
  let result;
  try {
    result = await execute(executable, ['--self-test'], {
      cwd: projectDir,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: SELF_TEST_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const detail = String(error.stderr || error.message || error)
      .slice(-2048)
      .trim();
    throw new Error(
      'Frozen PokeFT8 self-test failed (90-second limit).' + (detail ? '\n' + detail : ''),
      { cause: error },
    );
  }
  let report;
  try {
    report = JSON.parse(result.stdout.trim());
  } catch (_) {
    throw new Error('Frozen PokeFT8 self-test did not return a JSON report.');
  }
  if (
    !report ||
    report.type !== 'self-test' ||
    report.protocol !== 1 ||
    report.ok !== true ||
    report.symbols_verified !== true ||
    report.width !== 160 ||
    report.height !== 144
  ) {
    throw new Error(
      'Frozen PokeFT8 self-test did not verify the emulator, symbols, and frame dimensions.',
    );
  }
  return report;
}

async function verifyPokeFT8Package(context, dependencies = {}) {
  const hostPlatform = dependencies.platform || process.platform;
  const hostArch = nativeArch(dependencies.arch || process.arch);
  const targetPlatform = context.electronPlatformName;
  const targetArch = typeof context.arch === 'number' ? Arch[context.arch] : undefined;
  if (!targetArch)
    throw new Error('PokeFT8 packaging requires a recognized electron-builder architecture.');
  if (targetPlatform !== hostPlatform || targetArch !== hostArch) {
    throw new Error(
      `Build PokeFT8 natively on ${targetPlatform}/${targetArch}; this host is ${hostPlatform}/${hostArch}. Cross-platform worker packaging is unsupported.`,
    );
  }
  const projectDir = context.packager.projectDir;
  if (typeof projectDir !== 'string' || !path.isAbsolute(projectDir))
    throw new Error('PokeFT8 packaging requires an absolute project directory.');
  const bundle = path.join(projectDir, 'pokeft8', 'dist', 'PokeFT8Bridge');
  const executable = path.join(
    bundle,
    targetPlatform === 'win32' ? 'PokeFT8Bridge.exe' : 'PokeFT8Bridge',
  );
  let bundleStat;
  let executableStat;
  try {
    bundleStat = fs.lstatSync(bundle);
    executableStat = fs.lstatSync(executable);
  } catch (_) {
    throw new Error(
      'The frozen PokeFT8 worker is missing. Activate the native Python environment and run npm run build:worker before packaging.',
    );
  }
  if (!bundleStat.isDirectory() || !executableStat.isFile())
    throw new Error('The frozen PokeFT8 bundle must contain a regular native executable.');
  if (hostPlatform !== 'win32') {
    try {
      fs.accessSync(executable, fs.constants.X_OK);
    } catch (_) {
      throw new Error('The frozen PokeFT8 worker does not have executable permissions.');
    }
  }
  const binary = executableTarget(executable);
  if (binary.platform !== targetPlatform || binary.arch !== targetArch) {
    throw new Error(
      `Frozen PokeFT8 worker is ${binary.platform}/${binary.arch}, but this package targets ${targetPlatform}/${targetArch}. Rebuild the worker natively.`,
    );
  }
  await selfTest(executable, projectDir, dependencies.execute || execFileAsync);
  checkBundleContents(bundle);
}

// electron-builder loads file hooks through their default export.
module.exports = verifyPokeFT8Package;
module.exports.default = verifyPokeFT8Package;
module.exports.checkBundleContents = checkBundleContents;
module.exports.executableTarget = executableTarget;
module.exports.selfTest = selfTest;
module.exports.SELF_TEST_TIMEOUT_MS = SELF_TEST_TIMEOUT_MS;
