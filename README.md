# GridTracker2 + PokeFT8

Private integration fork of [GridTracker2](https://gitlab.com/gridtracker.org/gridtracker2)
with [PokeFT8](https://github.com/plaingca/PokeFT8) embedded in the main window.
The Game Boy dock turns your existing WSJT-X traffic into Pokemon Red encounters
while GridTracker's map and radio controls continue to work.

See **[POKEFT8.md](POKEFT8.md)** for setup, controls, architecture, tests and native
packaging. Select your own supported ROM from the dock. No game files are supplied.
This fork has a separate application ID and data directory; official GridTracker
automatic updates are disabled to preserve the integration.

## Project Setup

### Install

```bash
$ npm install
```

Also follow the PokeFT8 Python setup in [POKEFT8.md](POKEFT8.md) when running from source.

### Development

```bash
$ npm run dev
```

### Build

```bash
# Build the PokeFT8 worker first, on the target machine
$ npm run build:worker

# For windows
$ npm run build:win

# For macOS (only buildable on macOS)
$ npm run build:mac

# For Linux
$ npm run build:linux

```

Build the worker **before** the Electron application. The worker and Electron must
use the same operating system and architecture. Native builds use
`electron-builder.pokeft8.yml` and never publish to the upstream download server.
