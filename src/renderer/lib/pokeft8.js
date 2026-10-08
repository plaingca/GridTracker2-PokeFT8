// PokeFT8 runs in a managed worker; this dock stays inside GridTracker's main window.
// It forwards the existing WSJT-X stream without opening another UDP listener.
(function () {
  'use strict';

  const ipc = electron.ipcRenderer;
  let snapshot = {
    running: false,
    starting: false,
    mode: 'demo',
    paused: false,
    sound: false,
    watts: 50,
  };
  let elements = null;
  let busy = false;
  let localError = '';
  let collectionKey = '';
  let feedKey = '';

  function text(element, value) {
    const next = value == null ? '' : String(value);
    if (element.textContent !== next) element.textContent = next;
  }

  function telemetry() {
    return snapshot.status || {};
  }

  function drawFrame(frame) {
    if (!elements || !frame) return;
    const png = typeof frame === 'string' ? frame : frame.png;
    if (typeof png !== 'string' || !png.length) return;
    elements.frame.src = 'data:image/png;base64,' + png;
    elements.frame.hidden = false;
    elements.placeholder.hidden = true;
  }

  function renderCollection(status) {
    const collection = Array.isArray(status.collection) ? status.collection : [];
    const key = JSON.stringify(collection);
    text(elements.collectionCount, collection.length);
    if (key !== collectionKey) {
      collectionKey = key;
      elements.collection.replaceChildren();
      if (!collection.length) {
        const empty = document.createElement('p');
        empty.className = 'pokeft8-empty';
        empty.textContent = 'Caught Pokémon will appear here.';
        elements.collection.append(empty);
      }
      for (const caught of collection) {
        const row = document.createElement('div');
        row.className = 'pokeft8-collection-row';
        const identity = document.createElement('span');
        const species = document.createElement('strong');
        species.textContent = String(caught.species || 'Pokémon');
        identity.append(
          species,
          document.createElement('br'),
          document.createTextNode(String(caught.call || '')),
        );
        const habitat = document.createElement('span');
        habitat.textContent = [caught.grid, caught.band].filter(Boolean).join(' · ');
        row.title = caught.ended ? 'Caught ' + caught.ended : 'Caught Pokémon';
        row.append(identity, habitat);
        elements.collection.append(row);
      }
    }

    const messages = Array.isArray(status.messages) ? status.messages.slice(-12).reverse() : [];
    const nextFeedKey = JSON.stringify(messages);
    if (nextFeedKey !== feedKey) {
      feedKey = nextFeedKey;
      elements.feed.replaceChildren();
      for (const message of messages.length ? messages : ['Waiting for an encounter.']) {
        const entry = document.createElement('li');
        entry.textContent = String(message);
        elements.feed.append(entry);
      }
    }
  }

  function render() {
    if (!elements) return;
    const status = telemetry();
    const running = Boolean(snapshot.running);
    const starting = Boolean(snapshot.starting);
    const mode = snapshot.mode || status.mode || 'demo';
    const paused = Boolean(snapshot.paused);

    elements.demo.setAttribute('aria-pressed', String(running && mode === 'demo'));
    elements.live.setAttribute('aria-pressed', String(running && mode === 'live'));
    elements.demo.disabled = busy || starting;
    elements.live.disabled = busy || starting;
    elements.stop.disabled = busy || (!running && !starting);
    elements.pause.disabled = busy || !running || mode !== 'demo';
    text(elements.pause, paused ? 'Resume demo' : 'Pause demo');
    elements.pause.setAttribute('aria-pressed', String(paused));
    elements.sound.disabled = busy || starting;
    elements.sound.checked = Boolean(snapshot.sound);
    elements.watts.disabled = busy || starting;
    if (document.activeElement !== elements.watts) elements.watts.value = snapshot.watts || 50;
    elements.rom.disabled = busy || starting;
    text(elements.rom, snapshot.romName ? 'Change ROM' : 'Choose ROM');
    text(elements.romName, snapshot.romName || 'Pokémon Red ROM required');
    elements.romName.title = snapshot.romName || 'Choose a local Pokémon Red ROM';
    elements.led.classList.toggle('is-on', running || starting);
    text(
      elements.connection,
      starting
        ? 'Starting emulator…'
        : running
          ? mode === 'demo'
            ? paused
              ? 'Demo · paused'
              : 'Demo · simulated contacts'
            : 'Live · ' + (status.own || 'waiting for FT8')
          : snapshot.romName
            ? 'Ready to start'
            : 'Select your ROM',
    );

    const error = localError || snapshot.error || status.error || '';
    text(elements.error, error);
    elements.error.hidden = !error;

    let state = 'Choose your ROM, then start a mode.';
    let detail = '';
    if (starting) state = 'Starting the virtual Game Boy…';
    else if (running) {
      state = paused ? 'Demo paused' : status.phase || 'Waiting for an FT8 encounter';
      if (status.opponent) state += ' · ' + status.opponent;
      const habitat = status.opponent
        ? [status.species, status.grid, status.band].filter(Boolean)
        : [];
      if (status.opponent && Number.isFinite(status.rx_snr)) habitat.push(status.rx_snr + ' dB');
      detail = [habitat.join(' · '), status.detail, status.note].filter(Boolean).join('\n');
    } else if (snapshot.romName) {
      state = 'Ready. Choose Demo or Live FT8.';
      detail = 'Your Live collection is saved between sessions.';
    }
    text(elements.state, state);
    text(elements.detail, detail);
    const dropped = Number(status.dropped_packets || 0) + Number(snapshot.droppedPackets || 0);
    text(
      elements.telemetry,
      (Number(status.packet_count) || 0) +
        ' packets' +
        (dropped ? ' · ' + dropped + ' dropped' : ''),
    );
    renderCollection(status);
  }

  function applySnapshot(value) {
    if (!value || typeof value !== 'object') return;
    snapshot = { ...snapshot, ...value };
    if (value.frame) drawFrame(value.frame);
    if (!snapshot.running && !snapshot.starting && !snapshot.frame && elements) {
      elements.frame.hidden = true;
      elements.placeholder.hidden = false;
    }
    render();
  }

  async function action(channel, payload) {
    if (busy) return;
    busy = true;
    localError = '';
    render();
    try {
      applySnapshot(await ipc.invoke(channel, payload));
    } catch (error) {
      localError =
        error && error.message
          ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : String(error);
    } finally {
      busy = false;
      render();
    }
  }

  function toggle(force) {
    if (!elements) return;
    const open = typeof force === 'boolean' ? force : elements.dock.hidden;
    elements.dock.hidden = !open;
    elements.button.setAttribute('aria-expanded', String(open));
    if (open) {
      elements.close.focus();
      ipc
        .invoke('pokeft8:get-state')
        .then(applySnapshot)
        .catch((error) => {
          localError = error.message || String(error);
          render();
        });
    } else elements.button.focus();
  }

  function mode(value) {
    if (snapshot.running) return action('pokeft8:command', { command: 'mode', mode: value });
    return action('pokeft8:start', { mode: value });
  }

  function setPower() {
    const watts = Number(elements.watts.value);
    if (!Number.isFinite(watts) || watts < 0.1 || watts > 1500) {
      localError = 'Enter a transmit power from 0.1 to 1500 watts.';
      render();
      return;
    }
    action('pokeft8:command', { command: 'power', watts });
  }

  function initialize() {
    const node = (name) => document.getElementById('pokeft8' + name);
    elements = {
      dock: node('Dock'),
      button: node('Button'),
      close: node('Close'),
      connection: node('Connection'),
      frame: node('Frame'),
      placeholder: node('ScreenPlaceholder'),
      led: node('PowerLed'),
      demo: node('Demo'),
      live: node('Live'),
      stop: node('Stop'),
      pause: node('Pause'),
      sound: node('Sound'),
      watts: node('Watts'),
      rom: node('Rom'),
      romName: node('RomName'),
      error: node('Error'),
      state: node('State'),
      detail: node('Detail'),
      collection: node('Collection'),
      collectionCount: node('CollectionCount'),
      telemetry: node('Telemetry'),
      feed: node('Feed'),
    };
    elements.button.addEventListener('click', () => toggle());
    elements.close.addEventListener('click', () => toggle(false));
    elements.demo.addEventListener('click', () => mode('demo'));
    elements.live.addEventListener('click', () => mode('live'));
    elements.stop.addEventListener('click', () => action('pokeft8:stop'));
    elements.pause.addEventListener('click', () =>
      action('pokeft8:command', { command: 'pause', paused: !snapshot.paused }),
    );
    elements.sound.addEventListener('change', () =>
      action('pokeft8:command', { command: 'sound', enabled: elements.sound.checked }),
    );
    elements.rom.addEventListener('click', () => action('pokeft8:select-rom'));
    elements.watts.addEventListener('change', setPower);
    elements.watts.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        setPower();
        elements.watts.blur();
      }
    });
    // Dock controls own their keystrokes while focused so map hotkeys cannot fire.
    elements.dock.addEventListener('keydown', (event) => event.stopPropagation());
    document.addEventListener(
      'keydown',
      (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyP') {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!event.repeat) toggle();
        } else if (
          event.key === 'Escape' &&
          !elements.dock.hidden &&
          elements.dock.contains(document.activeElement)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          toggle(false);
        }
      },
      true,
    );
    ipc.on('pokeft8:update', (_event, update) => {
      if (!update || typeof update !== 'object') return;
      if (update.type === 'frame') drawFrame(update);
      else if (update.type === 'state') applySnapshot(update.state);
    });
    render();
    ipc
      .invoke('pokeft8:get-state')
      .then(applySnapshot)
      .catch((error) => {
        localError = error.message || String(error);
        render();
      });
  }

  window.PokeFT8 = {
    toggle,
    // No radio commands are emitted. The worker only observes received packets.
    ingestPacket(message) {
      if (!snapshot.running || snapshot.starting || snapshot.mode !== 'live' || !message)
        return false;
      try {
        ipc.send('pokeft8:packet', message.toString('base64'));
        return true;
      } catch (error) {
        console.warn('PokeFT8 packet forwarding failed:', error.message);
        return false;
      }
    },
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
