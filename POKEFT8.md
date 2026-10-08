# PokeFT8 in GridTracker2

Open the **PokeFT8** controller button in GridTracker's control panel, or press
**Ctrl+Shift+P** (Cmd+Shift+P on macOS). The Game Boy lives inside the main window.
Select your own English Pokemon Red ROM, then start **Live** or **Demo**.

Supported ROM SHA-1: `ea9bcae617fdf159b045185467ae58b2e4a48b9a`.
Other revisions are rejected before emulator hooks run. The original ROM and
cartridge save are never modified or uploaded. No ROM is downloaded or packaged.

## Live operation

Configure WSJT-X to send to GridTracker2 as usual. PokeFT8 receives a copy from
GridTracker's existing UDP receiver, including its configured port and multicast
settings. There is no second listener or additional WSJT-X forwarding setup.

The first WSJT-X instance sending Status to the running game is selected; it must
use standard FT8. When several instances share the receiver, the game follows only
that first instance until Live is restarted. CQ explores Route 1;
directed calls and replies start battles; exchanges become attacks; completed
acknowledgements trigger a Poke Ball capture. Captures are separate from official
QSO logging. GridTracker's existing radio controls retain their usual behavior;
PokeFT8 never sends WSJT-X commands or chooses your radio target.

Weaker signals mean stronger wild Pokemon. Maidenhead grids determine species
across the original 151; callsigns become in-game nicknames. **Watts** is a manual
game setting (0.1–1500 W), because WSJT-X does not provide actual transmitter power.

**Demo** replays a synthetic exchange with real FT8 pacing and an in-memory
collection. **Pause** applies to demo only. **Sound** is muted at startup and uses
the emulator's audio clock. Hiding the dock keeps the current session running;
use its square **Stop** button to stop the worker. Live captures and habitats
persist locally.

## Local data

The application uses `GridTracker2-PokeFT8` under Electron's application-data
directory. ROM selection and manual power are saved in `PokeFT8/settings.json`;
live contacts, captures and generated emulator states remain in `PokeFT8/` there.
The ROM stays at the selected filesystem path. The upstream GridTracker2 profile
is separate. `--gt-name NAME` creates another named fork profile as usual.

The fork does not use the official GridTracker updater or update server. New
integration versions must be installed from this private repository.

## Source setup

Use Node.js 22 or newer and Python 3.13. From the repository root:

```powershell
npm ci
python -m venv pokeft8/.venv
pokeft8/.venv/Scripts/python.exe -m pip install -r pokeft8/requirements-build.txt
pokeft8/.venv/Scripts/python.exe pokeft8/prepare_reference.py
npm run dev
```

On Linux/macOS, replace `pokeft8/.venv/Scripts/python.exe` with
`pokeft8/.venv/bin/python`. The manager discovers this venv automatically; set
`POKEFT8_PYTHON` to an absolute interpreter path to override it. Linux needs SDL's
standard desktop/audio shared libraries. Symbols are fetched from a fixed
pret/pokered commit and verified with SHA-256; they contain no cartridge ROM.

## Build native packages

Build on the target OS and architecture. Activate the venv so `python` resolves
to the pinned build environment, then:

```powershell
npm run build:worker
npm run build:unpack
# Or create the Windows x64 installer:
npm run build:win
```

Linux: `npm run build:linux`. macOS: `npm run build:mac`; unsigned ZIP packaging
is configured, and architecture must match the worker. The worker uses PyInstaller
and includes Python, PyBoy, SDL, NumPy, Pillow, symbols and dependency notices.
Packaged users do not install Python. Builds fail if worker startup fails or if
game/private files appear in its bundle. Electron bundles it outside ASAR at
`resources/pokeft8/`. This integration does not target Windows 7 or 32-bit Windows.

GitHub Actions builds Windows x64, Linux x64 and macOS arm64 packages. These
checks use no ROM; a real-ROM integration smoke test is available locally.

## Verification

```powershell
npm test
python -m unittest discover -s pokeft8 -v
```

`npm run test:smoke` launches the actual Electron application with an isolated
temporary profile. Set `POKEFT8_ROM` to a supported local ROM to test the complete
emulator demo and live packet forwarding. Set `POKEFT8_EXECUTABLE` to the packaged
executable to exercise the frozen worker instead of the source worker. Screenshots
and diagnostics are written to ignored `artifacts/`; they are never committed.

The npm audit of the upstream dependency graph reported 29 advisories at import.
The integration preserves that dependency baseline; broad Electron/dependency
upgrades require separate compatibility testing. This fork is an unofficial
hobby integration and retains upstream licenses and attribution. See
[THIRD-PARTY-PokeFT8.md](THIRD-PARTY-PokeFT8.md).

## Implementation

`src/renderer/lib/pokeft8.js` owns the dock and displays PNG frames with nearest
pixel scaling. `wsjtxUdp.js` forwards incoming datagrams to the main process.
`src/main/pokeft8.js` owns one child worker, validates commands, bounds packet
backlogs and handles crashes, reloads and application shutdown. `pokeft8/bridge.py`
runs the existing QSO engine and a windowless PyBoy emulator over newline JSON
pipes. There is no local web server, new network port or separate game window.

Upstream source commit: `ed4697c03d0d3585b87acc8b417a1f6cc2ddeaf4`.
The `upstream` Git remote tracks GridTracker's GitLab repository; `origin` is the
private GitHub fork. Original GridTracker history is retained.
