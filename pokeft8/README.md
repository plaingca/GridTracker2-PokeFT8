# PokeFT8 embedded worker

This directory adapts the Python game engine from [plaingca/PokeFT8](https://github.com/plaingca/PokeFT8), source revision `a7a75a109549b8bbf709300dcf2bbd8e75474ca6`, for the GridTracker2 interface. The copied engine, ecology, binary WSJT-X parser, demo timeline, Red emulator adapter, and optional audio retain their source attribution. The original PokeFT8 source did not contain a separate license file when imported; this private integration is made at its owner's request. GridTracker2's existing license and notices remain in the repository root.

No ROM, Nintendo artwork, cartridge save, contacts database, or prepared emulator state is included. A user's supported English Pokemon Red ROM is required. The adapter verifies SHA-1 `ea9bcae617fdf159b045185467ae58b2e4a48b9a` before executing emulator hooks and opens cartridge RAM in memory. The user's ROM and adjacent save are never modified.

The Electron process owns WSJT-X networking. The worker never opens a UDP listener; live mode consumes copies of the same incoming datagrams GridTracker2 already receives. Game actions never send radio-control commands.

## Run from source

Use Python 3.13 and install the exact runtime versions in `requirements-lock.txt`:

```powershell
python -m venv pokeft8/.venv
pokeft8\.venv\Scripts\python.exe -m pip install -r pokeft8\requirements-lock.txt
pokeft8\.venv\Scripts\python.exe pokeft8\prepare_reference.py
pokeft8\.venv\Scripts\python.exe -u pokeft8\bridge.py --rom "C:\path\Pokemon Red.gb" --data-dir "$env:APPDATA\GridTracker2-PokeFT8\PokeFT8" --mode demo
```

`prepare_reference.py` fetches only the checksum-pinned `pret/pokered` symbol table. The bundled `reference/` directory is read-only at runtime. `--data-dir` is required and contains generated bootstrap state, settings maintained by Electron, and the live contacts database. The worker reads saved TX power on startup; Electron owns all settings writes. Demo contacts remain in memory and reset on restart. Running `bridge.py --self-test` verifies native dependencies and the symbol checksum without opening a ROM or creating user data.

## Worker protocol, version 1

The host writes one JSON object per newline to stdin. Stdout contains only one JSON event per newline; Python and native emulator diagnostic output is redirected to stderr. Input is bounded to 128 KiB per record, incoming datagrams to 65,507 bytes, telemetry to 512 queued packets, and controls to 64 queued records. A packet burst never occupies the control queue. Shutdown bypasses both queues and cancels intro preparation.

| Command | Fields | Behavior |
| --- | --- | --- |
| `start` / `configure` | `rom`, `mode` | Start/reload the ROM. `rom` may be omitted after a successful start; mode is `demo` or `live`. |
| `mode` | `mode` | Reset the session and switch demo/live databases. |
| `restart` | none | Replay the current mode from a fresh session. |
| `packet` | `data` | Base64 raw WSJT-X UDP datagram, consumed only in live mode. |
| `pause` | `paused` | Boolean; freeze/resume the demo timeline and emulator. |
| `sound` | `enabled` | Boolean; enable/disable local SDL audio. |
| `power` | `watts` | Set manual TX power, 0.1 through 1500 W. Electron persists the setting. |
| `shutdown` | none | Close SQLite/emulator resources and exit. |

Commands use a `command` key, for example `{"command":"mode","mode":"live"}`. Optional `id` values are echoed in `ack` and command `error` events. Telemetry has no acknowledgement.

`starting` announces ROM loading. `ready` includes `protocol: 1`, `running`, `rom`, and `mode`; launching without `--rom` produces `ready` with `running:false` and waits for a `start` command. `status` is emitted four times a second. `frame` provides `png` as base64, plus `width:160` and `height:144`, at 20 fps by default (`--fps 15` through `30`). Frames are coalesced if the host is slow. `error` includes `message`, optionally `command` and `id`. `stopped` confirms cleanup.

`status` fields include `running`, `rom`, `mode`, `paused`, `sound`, `watts`, `state`, `game_state`, `opponent`, `own`, `species`, `rarity`, `grid`, `rx_snr`, `tx_snr`, `message`, `note`, `phase`, `detail`, `band`, `frequency`, `exchange_stage`, `retry`, `player_level`, `opponent_level`, `packet_count`, `bad_packets`, `dropped_packets`, `elapsed`, `error`, `candidates`, `collection`, and `messages`. Candidates contain `{call,snr,message}`. Collection entries contain `{call,band,ended,grid,species}`; the status payload includes the latest 500 captures. Messages is a bounded feed of encounter, move, inferred miss, and capture summaries. Game-dependent fields are absent before a ROM is loaded.

## Verify without a ROM

```powershell
python -m unittest discover -s pokeft8 -p "test_*.py" -v
```

The original engine/parser tests are preserved. Bridge checks exercise telemetry ingestion and real binary demo packets, demo/live database isolation, pause/resume timing, TX-power validation and preservation of host settings, queue bounds and shutdown priority, invalid commands, and the actual newline-JSON process protocol. The process test also verifies that a later start fails cleanly for an invalid cartridge, guarding against a Windows native-import/stdin-lock deadlock. Native ROM playback is a separate local check with the user's cartridge.
