'use strict';

// The emulator lives in a child process. GridTracker only gives it received UDP
// packets: this integration never creates a socket or transmits radio commands.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_LINE_BYTES = 512 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;
const MAX_PACKET_BYTES = 65507;
const MAX_QUEUE_BYTES = 512 * 1024;
const MAX_QUEUED_PACKETS = 128;
const MAX_QUEUED_COMMANDS = 32;
const STATUS_FIELDS = new Set([
  'mode',
  'paused',
  'sound',
  'watts',
  'state',
  'opponent',
  'own',
  'species',
  'rarity',
  'grid',
  'rx_snr',
  'tx_snr',
  'message',
  'note',
  'phase',
  'detail',
  'band',
  'frequency',
  'packet_count',
  'bad_packets',
  'dropped_packets',
  'elapsed',
  'candidates',
  'collection',
  'messages',
  'game_state',
  'player_level',
  'opponent_level',
  'exchange_stage',
  'retry',
  'error',
]);

function validWatts(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.1 && value <= 1500;
}

function validateCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('PokeFT8 command must be an object.');
  }
  switch (input.command) {
    case 'mode':
      if (input.mode !== 'demo' && input.mode !== 'live') break;
      return { command: 'mode', mode: input.mode };
    case 'pause':
      if (typeof input.paused !== 'boolean') break;
      return { command: 'pause', paused: input.paused };
    case 'sound':
      if (typeof input.enabled !== 'boolean') break;
      return { command: 'sound', enabled: input.enabled };
    case 'power':
      if (!validWatts(input.watts)) break;
      return { command: 'power', watts: input.watts };
    case 'restart':
      return { command: 'restart' };
    default:
      throw new Error('Unsupported PokeFT8 command.');
  }
  throw new Error('Invalid PokeFT8 command value.');
}

function sanitizeStatus(message) {
  const status = {};
  for (const [key, value] of Object.entries(message)) {
    if (!STATUS_FIELDS.has(key)) continue;
    if (typeof value === 'string') status[key] = value.slice(0, 4096);
    else if (typeof value === 'number' && Number.isFinite(value)) status[key] = value;
    else if (typeof value === 'boolean' || value === null) status[key] = value;
    else if (Array.isArray(value)) status[key] = value.slice(0, key === 'collection' ? 500 : 100);
  }
  return status;
}

class PokeFT8Manager {
  constructor(options) {
    this.app = options.app;
    this.ipcMain = options.ipcMain;
    this.dialog = options.dialog;
    this.getWindow = options.getWindow;
    this.spawn = options.spawn || spawn;
    this.fs = options.fs || fs;
    this.platform = options.platform || process.platform;
    this.environment = options.env || process.env;
    this.resourcesPath = options.resourcesPath || process.resourcesPath;
    this.startupTimeoutMs = options.startupTimeoutMs || 30000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs || 3000;
    this.dataDir = path.join(this.app.getPath('userData'), 'PokeFT8');
    this.configPath = path.join(this.dataDir, 'settings.json');
    this.fs.mkdirSync(this.dataDir, { recursive: true });
    this.state = {
      running: false,
      starting: false,
      mode: 'demo',
      paused: false,
      sound: false,
      watts: 50,
      romPath: '',
      romName: '',
      error: '',
      droppedPackets: 0,
      status: {},
      frame: null,
    };
    this.child = null;
    this.queue = [];
    this.queueBytes = 0;
    this.writeBlocked = false;
    this.stdout = '';
    this.stderr = '';
    this.startPromise = null;
    this.stopPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.startTimer = null;
    this.stopTimer = null;
    this.stopResolve = null;
    this.registeredHandlers = [];
    this.packetListener = null;
    this.loadConfig();
  }

  loadConfig() {
    try {
      const config = JSON.parse(this.fs.readFileSync(this.configPath, 'utf8'));
      if (
        typeof config.romPath === 'string' &&
        path.isAbsolute(config.romPath) &&
        /\.(gb|gbc)$/i.test(config.romPath)
      ) {
        this.state.romPath = config.romPath;
        this.state.romName = path.basename(config.romPath);
      }
      if (validWatts(config.watts)) this.state.watts = config.watts;
      // Each app launch begins muted; the current dock can explicitly enable sound.
      if (config.mode === 'demo' || config.mode === 'live') this.state.mode = config.mode;
    } catch (error) {
      // A first launch, removed settings, or corrupt file gets safe defaults.
      if (error.code !== 'ENOENT')
        this.state.error = 'PokeFT8 settings could not be loaded; defaults were restored.';
    }
  }

  saveConfig() {
    const { romPath, watts, sound, mode } = this.state;
    const temporary = this.configPath + '.tmp';
    this.fs.writeFileSync(temporary, JSON.stringify({ romPath, watts, sound, mode }, null, 2));
    this.fs.renameSync(temporary, this.configPath);
  }

  snapshot() {
    return { ...this.state, status: { ...this.state.status } };
  }

  broadcast(message = { type: 'state', state: this.snapshot() }) {
    const window = this.getWindow();
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send('pokeft8:update', message);
    }
  }

  requireOwner(event) {
    const window = this.getWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents) {
      throw new Error('PokeFT8 is available only in the main GridTracker window.');
    }
  }

  register() {
    const handlers = {
      'pokeft8:get-state': () => this.snapshot(),
      'pokeft8:start': (input) => this.start(input),
      'pokeft8:select-rom': () => this.selectRom(),
      'pokeft8:command': (input) => this.command(input),
      'pokeft8:stop': () => this.stop(),
    };
    for (const [channel, handler] of Object.entries(handlers)) {
      this.ipcMain.handle(channel, async (event, input) => {
        this.requireOwner(event);
        try {
          return await handler(input);
        } catch (error) {
          this.state.error = String(error.message || error).slice(0, 4096);
          this.broadcast();
          throw error;
        }
      });
      this.registeredHandlers.push(channel);
    }
    this.packetListener = (event, data) => {
      try {
        this.requireOwner(event);
        this.packet(data);
      } catch (_) {
        // UDP events have no reply channel. Malformed or foreign events are ignored.
      }
    };
    this.ipcMain.on('pokeft8:packet', this.packetListener);
    return this;
  }

  async selectRom() {
    const result = await this.dialog.showOpenDialog(this.getWindow(), {
      title: 'Choose your Pokémon Game Boy ROM for PokeFT8',
      properties: ['openFile'],
      filters: [{ name: 'Game Boy ROM', extensions: ['gb', 'gbc'] }],
    });
    if (result.canceled || !result.filePaths.length) return this.snapshot();
    const romPath = result.filePaths[0];
    this.validateRom(romPath);
    if (romPath !== this.state.romPath) await this.stop();
    this.state.romPath = romPath;
    this.state.romName = path.basename(romPath);
    this.state.error = '';
    this.state.frame = null;
    this.saveConfig();
    this.broadcast();
    return this.snapshot();
  }

  validateRom(romPath) {
    if (!path.isAbsolute(romPath) || !/\.(gb|gbc)$/i.test(romPath)) {
      throw new Error('Choose a .gb or .gbc ROM file.');
    }
    let stat;
    try {
      stat = this.fs.statSync(romPath);
    } catch (_) {
      throw new Error('The selected ROM could not be found. Choose the ROM again.');
    }
    if (!stat.isFile() || stat.size < 32768 || stat.size > 8 * 1024 * 1024) {
      throw new Error('The selected file is not a valid Game Boy ROM size.');
    }
  }

  executable() {
    if (this.app.isPackaged) {
      const filename = this.platform === 'win32' ? 'PokeFT8Bridge.exe' : 'PokeFT8Bridge';
      const executable = path.join(this.resourcesPath, 'pokeft8', filename);
      if (!this.fs.existsSync(executable))
        throw new Error('The bundled PokeFT8 engine is missing. Reinstall this fork.');
      return { file: executable, args: [] };
    }
    const root = this.app.getAppPath();
    const python =
      this.environment.POKEFT8_PYTHON ||
      path.join(
        root,
        'pokeft8',
        '.venv',
        this.platform === 'win32' ? 'Scripts' : 'bin',
        this.platform === 'win32' ? 'python.exe' : 'python',
      );
    if (!this.environment.POKEFT8_PYTHON && !this.fs.existsSync(python)) {
      throw new Error(
        'PokeFT8 Python is not installed. Run the PokeFT8 setup script or set POKEFT8_PYTHON to your Python executable.',
      );
    }
    return { file: python, args: ['-u', path.join(root, 'pokeft8', 'bridge.py')] };
  }

  async start(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('PokeFT8 start options must be an object.');
    }
    const mode =
      input.mode === undefined
        ? this.state.mode
        : validateCommand({ command: 'mode', mode: input.mode }).mode;
    if (this.stopPromise) await this.stopPromise;
    if (this.startPromise) {
      await this.startPromise;
      return this.command({ command: 'mode', mode });
    }
    if (this.state.running) return this.command({ command: 'mode', mode });
    if (!this.state.romPath) await this.selectRom();
    if (!this.state.romPath) return this.snapshot();
    this.validateRom(this.state.romPath);
    const executable = this.executable();
    this.state.mode = mode;
    this.state.starting = true;
    this.state.running = false;
    this.state.paused = false;
    this.state.error = '';
    this.state.status = {};
    this.state.frame = null;
    this.state.droppedPackets = 0;
    this.stdout = '';
    this.stderr = '';
    this.clearQueue();
    this.saveConfig();
    this.startPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // Retain the promise even if spawn or the child emits an immediate error.
    const ready = this.startPromise;
    this.broadcast();
    try {
      const child = this.spawn(
        executable.file,
        [
          ...executable.args,
          '--rom',
          this.state.romPath,
          '--data-dir',
          this.dataDir,
          '--mode',
          mode,
        ],
        {
          cwd: this.app.isPackaged ? path.dirname(executable.file) : this.app.getAppPath(),
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...this.environment, PYTHONUNBUFFERED: '1' },
        },
      );
      this.child = child;
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        if (this.child === child) this.onOutput(chunk);
      });
      child.stderr.on('data', (chunk) => {
        if (this.child === child) this.stderr = (this.stderr + chunk).slice(-MAX_STDERR_BYTES);
      });
      child.stdin.on('drain', () => {
        if (this.child === child) {
          this.writeBlocked = false;
          this.flushQueue();
        }
      });
      child.stdin.on('error', (error) => {
        if (this.child === child && !this.stopPromise)
          this.fail('PokeFT8 engine input failed: ' + error.message);
      });
      child.on('error', (error) => {
        if (this.child === child) this.fail('Could not launch PokeFT8: ' + error.message);
      });
      child.on('close', (code, signal) => {
        if (this.child === child) this.onClose(code, signal);
      });
      this.startTimer = setTimeout(
        () => this.fail('PokeFT8 engine did not become ready in time.'),
        this.startupTimeoutMs,
      );
      this.startTimer.unref?.();
    } catch (error) {
      this.fail('Could not launch PokeFT8: ' + error.message);
    }
    await ready;
    return this.snapshot();
  }

  onOutput(chunk) {
    this.stdout += chunk;
    let newline;
    while ((newline = this.stdout.indexOf('\n')) !== -1) {
      const line = this.stdout.slice(0, newline);
      this.stdout = this.stdout.slice(newline + 1);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES)
        return this.fail('PokeFT8 engine output exceeded the protocol limit.');
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (_) {
        return this.fail('PokeFT8 engine sent invalid JSON.');
      }
      if (!message || typeof message !== 'object' || Array.isArray(message))
        return this.fail('PokeFT8 engine sent an invalid response.');
      this.onMessage(message);
      if (!this.child) return;
    }
    if (Buffer.byteLength(this.stdout) > MAX_LINE_BYTES)
      this.fail('PokeFT8 engine output exceeded the protocol limit.');
  }

  onMessage(message) {
    switch (message.type) {
      case 'ready': {
        if (this.stopPromise || !this.state.starting) return;
        if (message.protocol !== 1 || message.running !== true)
          return this.fail(
            'This PokeFT8 engine did not confirm a running session with the supported protocol.',
          );
        clearTimeout(this.startTimer);
        this.startTimer = null;
        this.state.starting = false;
        this.state.running = true;
        this.send({ command: 'power', watts: this.state.watts });
        this.send({ command: 'sound', enabled: this.state.sound });
        const resolve = this.readyResolve;
        this.readyResolve = this.readyReject = null;
        this.startPromise = null;
        resolve?.(this.snapshot());
        this.broadcast();
        break;
      }
      case 'status': {
        this.state.status = sanitizeStatus(message);
        if (message.mode === 'demo' || message.mode === 'live') this.state.mode = message.mode;
        if (typeof message.paused === 'boolean') this.state.paused = message.paused;
        if (typeof message.sound === 'boolean') this.state.sound = message.sound;
        if (validWatts(message.watts)) this.state.watts = message.watts;
        this.broadcast();
        break;
      }
      case 'frame': {
        if (
          message.width !== 160 ||
          message.height !== 144 ||
          typeof message.png !== 'string' ||
          message.png.length > MAX_LINE_BYTES ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(message.png)
        ) {
          return this.fail('PokeFT8 engine sent an invalid frame.');
        }
        const frame = { type: 'frame', png: message.png, width: 160, height: 144 };
        this.state.frame = frame;
        this.broadcast(frame);
        break;
      }
      case 'error':
        this.state.error =
          typeof message.message === 'string'
            ? message.message.slice(0, 4096)
            : 'PokeFT8 engine reported an error.';
        if (this.state.starting) this.fail(this.state.error);
        else this.broadcast();
        break;
      case 'starting':
      case 'ack':
      case 'stopped':
        break;
      default:
        this.fail('PokeFT8 engine sent an unknown response.');
    }
  }

  fail(message) {
    this.state.error = message.slice(0, 4096);
    this.state.starting = false;
    this.state.running = false;
    clearTimeout(this.startTimer);
    this.startTimer = null;
    const reject = this.readyReject;
    this.readyResolve = this.readyReject = null;
    this.startPromise = null;
    reject?.(new Error(this.state.error));
    this.stdout = '';
    this.clearQueue();
    this.broadcast();
    // Keep the handle until close, so another start cannot orphan the old engine.
    if (this.child && !this.stopPromise) void this.stop();
  }

  onClose(code, signal) {
    const expected = Boolean(this.stopPromise);
    this.child = null;
    clearTimeout(this.startTimer);
    clearTimeout(this.stopTimer);
    this.startTimer = this.stopTimer = null;
    this.state.running = false;
    this.state.starting = false;
    this.state.paused = false;
    this.clearQueue();
    if (!expected && !this.state.error) {
      const diagnostic = this.stderr.trim().slice(-2000);
      this.state.error =
        'PokeFT8 engine exited unexpectedly (' +
        (signal || code) +
        ').' +
        (diagnostic ? '\n' + diagnostic : '');
    }
    const reject = this.readyReject;
    this.readyResolve = this.readyReject = null;
    this.startPromise = null;
    reject?.(new Error(this.state.error || 'PokeFT8 engine stopped before it was ready.'));
    const resolve = this.stopResolve;
    this.stopResolve = null;
    this.stopPromise = null;
    this.broadcast();
    resolve?.(this.snapshot());
  }

  clearQueue() {
    this.queue = [];
    this.queueBytes = 0;
    this.writeBlocked = false;
  }

  send(command, packet = false) {
    if (!this.child || this.child.stdin.destroyed || this.child.stdin.writableEnded) return false;
    const line = JSON.stringify(command) + '\n';
    const bytes = Buffer.byteLength(line);
    if (this.writeBlocked || this.queue.length) {
      const packetCount = this.queue.filter((entry) => entry.packet).length;
      const commandCount = this.queue.length - packetCount;
      if (!packet && commandCount >= MAX_QUEUED_COMMANDS)
        throw new Error('PokeFT8 engine is busy; try again shortly.');
      if (
        packet &&
        (packetCount >= MAX_QUEUED_PACKETS || this.queueBytes + bytes > MAX_QUEUE_BYTES)
      ) {
        this.state.droppedPackets++;
        return false;
      }
      this.queue.push({ line, bytes, packet });
      this.queueBytes += bytes;
      return true;
    }
    try {
      this.writeBlocked = !this.child.stdin.write(line);
    } catch (error) {
      this.fail('PokeFT8 engine input failed: ' + error.message);
      return false;
    }
    return true;
  }

  flushQueue() {
    while (this.child && !this.writeBlocked && this.queue.length) {
      const entry = this.queue.shift();
      this.queueBytes -= entry.bytes;
      try {
        this.writeBlocked = !this.child.stdin.write(entry.line);
      } catch (error) {
        this.fail('PokeFT8 engine input failed: ' + error.message);
        return;
      }
    }
  }

  packet(data) {
    if (!this.state.running || this.state.mode !== 'live' || this.stopPromise) return false;
    if (
      typeof data !== 'string' ||
      data.length > Math.ceil(MAX_PACKET_BYTES / 3) * 4 ||
      data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
    )
      return false;
    if (Buffer.from(data, 'base64').length > MAX_PACKET_BYTES) return false;
    return this.send({ command: 'packet', data }, true);
  }

  command(input) {
    const command = validateCommand(input);
    if (command.command === 'pause' && this.state.mode !== 'demo')
      throw new Error('Pause is available only in demo mode.');
    if (command.command === 'restart' && !this.state.running)
      throw new Error('Start PokeFT8 before restarting it.');
    if (this.state.starting || this.stopPromise)
      throw new Error('PokeFT8 is starting or stopping; try again shortly.');
    if (this.state.running && !this.send(command))
      throw new Error('PokeFT8 engine is unavailable.');
    switch (command.command) {
      case 'mode':
        this.state.mode = command.mode;
        this.state.paused = false;
        if (command.mode !== 'live') {
          this.queue = this.queue.filter((entry) => !entry.packet);
          this.queueBytes = this.queue.reduce((total, entry) => total + entry.bytes, 0);
        }
        break;
      case 'pause':
        this.state.paused = command.paused;
        break;
      case 'sound':
        this.state.sound = command.enabled;
        break;
      case 'power':
        this.state.watts = command.watts;
        break;
      case 'restart':
        this.state.paused = false;
        this.state.status = {};
        break;
    }
    this.state.error = '';
    this.saveConfig();
    this.broadcast();
    return this.snapshot();
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    if (!this.child) return Promise.resolve(this.snapshot());
    this.stopPromise = new Promise((resolve) => {
      this.stopResolve = resolve;
    });
    const stopped = this.stopPromise;
    const child = this.child;
    this.state.running = false;
    this.state.starting = false;
    clearTimeout(this.startTimer);
    this.startTimer = null;
    const reject = this.readyReject;
    this.readyResolve = this.readyReject = null;
    this.startPromise = null;
    reject?.(new Error(this.state.error || 'PokeFT8 startup was canceled.'));
    this.queue = this.queue.filter((entry) => !entry.packet);
    this.queueBytes = this.queue.reduce((total, entry) => total + entry.bytes, 0);
    try {
      this.send({ command: 'shutdown' });
    } catch (_) {
      child.kill();
    }
    this.stopTimer = setTimeout(() => {
      if (this.child === child) child.kill('SIGKILL');
    }, this.shutdownTimeoutMs);
    this.stopTimer.unref?.();
    this.broadcast();
    return stopped;
  }

  async dispose() {
    await this.stop();
    for (const channel of this.registeredHandlers) this.ipcMain.removeHandler(channel);
    this.registeredHandlers = [];
    if (this.packetListener) this.ipcMain.removeListener('pokeft8:packet', this.packetListener);
    this.packetListener = null;
  }
}

module.exports = {
  PokeFT8Manager,
  validateCommand,
  sanitizeStatus,
  MAX_QUEUED_PACKETS,
  MAX_QUEUE_BYTES,
};
