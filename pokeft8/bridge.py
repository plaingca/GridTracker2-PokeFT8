"""Headless PokeFT8 worker for GridTracker2; stdout is newline-delimited JSON.

The Electron host owns networking. This worker only consumes copies of incoming
WSJT-X datagrams and never opens a UDP socket or emits a radio-control packet.
"""

import argparse
import base64
import binascii
import hashlib
import io
import json
import math
import os
import queue
import sys
import threading
import time
from collections import deque
from pathlib import Path

from demo import real_sequence
from ecology import snr_level, watts_level
from engine import Dex, Engine, band
from protocol import decode

PROTOCOL_VERSION = 1
MAX_PACKET = 65507
MAX_LINE = 131072
GAME_HZ = 4194304 / 70224


def validate_mode(value):
    if value not in ("demo", "live"):
        raise ValueError("Mode must be demo or live")
    return value


def validate_power(value):
    if isinstance(value, bool):
        raise ValueError("TX power must be a number between 0.1 and 1500 watts")
    try:
        watts = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("TX power must be a number between 0.1 and 1500 watts") from exc
    if not math.isfinite(watts) or not 0.1 <= watts <= 1500:
        raise ValueError("TX power must be a number between 0.1 and 1500 watts")
    return watts


def boolean(command, name):
    value = command.get(name)
    if not isinstance(value, bool):
        raise ValueError(f"{name} must be true or false")
    return value


def create_red(path, clock, data_dir, cancelled):
    # Delay importing native emulator/audio dependencies until they are needed.
    # Keep startup failures and emulator diagnostics outside the JSON channel.
    from rom import Red

    red = Red.__new__(Red)
    try:
        red.__init__(path, clock=clock, data_dir=data_dir, cancelled=cancelled)
        return red
    except Exception:
        if hasattr(red, "p"):
            red.close()
        raise


class Controller:
    """Session state, separated from pipes/native dependencies for ROM-free tests."""

    def __init__(
        self,
        data_dir,
        emit,
        cancelled=lambda: False,
        red_factory=create_red,
        clock=time.monotonic,
    ):
        self.data_dir = Path(data_dir).resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.emit = emit
        self.cancelled = cancelled
        self.red_factory = red_factory
        self.clock = clock
        self.red = None
        self.engine = None
        self.rom = ""
        self.mode = "demo"
        self.paused = False
        self.started = self.clock()
        self.paused_at = None
        self.watts = 50.0
        self.packet_count = 0
        self.bad_packets = 0
        self.dropped_packets = 0
        self.timeline = []
        self.index = 0
        self.frame_budget = 0.0
        self.messages = deque(maxlen=12)
        self.last_game_error = ""
        try:
            saved = json.loads((self.data_dir / "settings.json").read_text(encoding="utf-8"))
            self.watts = validate_power(saved.get("watts", 50))
        except (OSError, ValueError, TypeError, AttributeError):
            pass

    def session_clock(self):
        if self.mode == "demo":
            current = self.paused_at if self.paused else self.clock()
            return current - self.started
        return self.clock()

    def close(self):
        if self.engine:
            self.engine.dex.db.close()
            self.engine = None
        if self.red:
            self.red.close()
            self.red = None

    def start(self, rom, mode):
        mode = validate_mode(mode)
        if not isinstance(rom, str) or not rom.strip():
            raise ValueError("Select an English Pokemon Red ROM before starting")
        path = Path(rom).expanduser().resolve()
        if not path.is_file():
            raise ValueError("The selected ROM file does not exist")
        self.emit({"type": "starting", "rom": str(path), "mode": mode})
        self.close()
        self.mode = mode
        self.paused = False
        self.started = self.clock()
        self.red = self.red_factory(path, self.session_clock, self.data_dir, self.cancelled)
        self.rom = str(path)
        self.reset(mode)
        self.emit(
            {
                "type": "ready",
                "protocol": PROTOCOL_VERSION,
                "running": True,
                "rom": self.rom,
                "mode": self.mode,
            }
        )

    def reset(self, mode):
        mode = validate_mode(mode)
        if not self.red:
            raise ValueError("Start the emulator before changing its session")
        if self.engine:
            self.engine.dex.db.close()
        self.mode = mode
        self.paused = False
        self.paused_at = None
        self.started = self.clock()
        self.frame_budget = 0.0
        self.timeline = real_sequence(missed_reply=True) if mode == "demo" else []
        self.index = 0
        self.packet_count = self.bad_packets = self.dropped_packets = 0
        self.messages.clear()
        self.last_game_error = ""
        database = ":memory:" if mode == "demo" else str(self.data_dir / "contacts.sqlite3")
        self.engine = Engine(Dex(database), clock=self.session_clock)
        self.engine.watts = self.watts
        self.red.watts = self.watts
        self.red.action({"type": "reset"})
        self.red.audio.clear()

    def ingest(self, packet):
        if not self.engine:
            return
        try:
            self.engine.handle(decode(packet))
            self.packet_count += 1
        except (ValueError, UnicodeError, OverflowError, KeyError, IndexError):
            self.bad_packets += 1

    def command(self, command):
        kind = command.get("command")
        if kind in ("configure", "start"):
            self.start(command.get("rom", self.rom), command.get("mode", self.mode))
        elif kind == "mode":
            self.reset(command.get("mode"))
        elif kind == "restart":
            self.reset(self.mode)
        elif kind == "pause":
            if not self.engine or self.mode != "demo":
                raise ValueError("Pause is available only during a running demo")
            paused = boolean(command, "paused")
            if paused != self.paused:
                if paused:
                    self.paused_at = self.clock()
                    self.red.audio.clear()
                else:
                    self.started += self.clock() - self.paused_at
                self.paused = paused
                self.frame_budget = 0.0
        elif kind == "sound":
            if not self.red:
                raise ValueError("Start the emulator before changing sound")
            self.red.audio.enable(boolean(command, "enabled"))
        elif kind == "power":
            watts = validate_power(command.get("watts"))
            # Electron owns settings persistence, including the selected ROM and
            # mode. The worker must never replace that shared settings file.
            self.watts = watts
            if self.engine:
                self.engine.watts = watts
            if self.red:
                self.red.watts = watts
        else:
            raise ValueError(f"Unknown command: {kind}")

    def advance(self, elapsed):
        if not self.engine or self.paused:
            return
        if self.mode == "demo":
            current = self.session_clock()
            while self.index < len(self.timeline) and self.timeline[self.index][0] <= current:
                self.ingest(self.timeline[self.index][1])
                self.index += 1
        self.engine.poll()
        while self.engine.actions:
            action = self.engine.actions.pop(0)
            self.red.action(action)
            if action["type"] == "encounter":
                signal = "SNR unknown" if action.get("snr") is None else f"{action['snr']:+d} dB"
                self.messages.append(f"ENCOUNTER  {action['call']}  {signal}")
            elif action["type"] == "attack":
                label = "MISS" if action.get("missed") else "MOVE"
                self.messages.append(
                    f"{action.get('side', 'rx').upper()} {label}  {action['message']}"
                )
            elif action["type"] == "capture":
                self.messages.append(f"CAPTURE  {action['call']} added to Pokédex")
        self.frame_budget += min(0.25, max(0, elapsed)) * GAME_HZ
        frames = int(self.frame_budget)
        self.frame_budget -= frames
        self.red.tick(frames)
        if self.red.error and self.red.error != self.last_game_error:
            self.last_game_error = self.red.error
            self.emit({"type": "error", "message": self.red.error, "command": "emulator"})

    def snapshot(self):
        basic = {
            "type": "status",
            "running": bool(self.red and self.engine),
            "rom": self.rom,
            "mode": self.mode,
            "paused": self.paused,
            "sound": bool(self.red and self.red.audio.enabled),
            "watts": self.watts,
            "packet_count": self.packet_count,
            "bad_packets": self.bad_packets,
            "dropped_packets": self.dropped_packets,
            "elapsed": self.session_clock(),
            "messages": list(self.messages),
            "collection": [],
            "candidates": [],
        }
        if not self.engine:
            return basic
        e = self.engine
        slot_time = self.session_clock() if self.mode == "demo" else time.time()
        remaining = 15 - slot_time % 15
        stale = e.last_packet is None or self.session_clock() - e.last_packet > 45
        if stale:
            phase, detail = "RADIO STANDBY", "No fresh telemetry"
        elif e.state == "success":
            phase, detail = "CONTACT CAPTURED", "Poké Ball capture"
        elif e.transmitting:
            phase = "TRANSMITTING"
            detail = (e.tx_message.split()[-1] if e.tx_message else "CQ") + f"  {remaining:04.1f}s"
        elif e.decoding:
            phase, detail = "DECODING", "Checking replies..."
        elif e.state == "await_log":
            phase, detail = "EXCHANGE COMPLETE", "Awaiting QSO log"
        else:
            phase, detail = "LISTENING", f"Next slot {remaining:04.1f}s"
        self.red.radio_phase, self.red.radio_detail = phase, detail
        self.red.slot_fraction = (slot_time % 15) / 15
        basic.update(
            state=e.state,
            opponent=e.opponent,
            own=e.own,
            species=e.species,
            rarity=e.rarity,
            grid=e.grid,
            rx_snr=e.rx_snr,
            tx_snr=e.tx_snr,
            message=e.last_message,
            note=e.note,
            phase=phase,
            detail=detail,
            band=band(e.frequency),
            frequency=e.frequency,
            exchange_stage=e.exchange_stage,
            retry=e.retry,
            player_level=watts_level(self.watts),
            opponent_level=snr_level(e.rx_snr),
            game_state=self.red.mode,
            error=self.red.error,
            candidates=sorted(e.candidates.values(), key=lambda item: -item["snr"]),
            collection=[
                dict(zip(("call", "band", "ended", "grid", "species"), row))
                for row in e.dex.collection()[:500]
            ],
        )
        return basic

    def frame(self):
        if not self.red:
            return None
        output = io.BytesIO()
        self.red.image().save(output, format="PNG", compress_level=1)
        return {
            "type": "frame",
            "png": base64.b64encode(output.getvalue()).decode("ascii"),
            "width": 160,
            "height": 144,
        }


class Mailbox:
    """Bounded ingestion; controls are independent of bursts of UDP telemetry."""

    def __init__(self, emit, shutdown, packet_limit=512, control_limit=64):
        self.emit, self.shutdown = emit, shutdown
        self.packets = queue.Queue(maxsize=packet_limit)
        self.controls = queue.Queue(maxsize=control_limit)
        self.dropped = 0

    def receive(self, command):
        if not isinstance(command, dict):
            raise ValueError("Command must be a JSON object")
        kind = command.get("command")
        if kind == "shutdown":
            self.shutdown.set()
            return
        if kind == "packet":
            data = command.get("data")
            if not isinstance(data, str) or len(data) > ((MAX_PACKET + 2) // 3) * 4:
                raise ValueError("Packet data must be a base64 WSJT-X datagram")
            try:
                packet = base64.b64decode(data, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise ValueError("Invalid base64 packet") from exc
            if not packet or len(packet) > MAX_PACKET:
                raise ValueError("Packet length is invalid")
            try:
                self.packets.put_nowait(packet)
            except queue.Full:
                self.dropped += 1
            return
        try:
            self.controls.put_nowait(command)
        except queue.Full as exc:
            raise ValueError("Command queue is full; try again after the worker is ready") from exc

    def clear_packets(self):
        while True:
            try:
                self.packets.get_nowait()
            except queue.Empty:
                return

    def read(self, stream):
        while not self.shutdown.is_set():
            raw = stream.readline(MAX_LINE + 1)
            if not raw:
                self.shutdown.set()
                return
            command = {}
            try:
                if len(raw) > MAX_LINE:
                    # Discard the rest of an oversized record before parsing the next one.
                    while raw and not raw.endswith(b"\n"):
                        raw = stream.readline(MAX_LINE + 1)
                    raise ValueError("Command exceeds the line size limit")
                command = json.loads(raw)
                self.receive(command)
            except (ValueError, UnicodeError) as exc:
                meta = command if isinstance(command, dict) else {}
                self.emit(
                    {
                        "type": "error",
                        "message": str(exc),
                        "command": meta.get("command"),
                        "id": meta.get("id"),
                    }
                )


class ProtocolOutput:
    """One pending frame and a bounded event queue prevent pipe backpressure stalls."""

    def __init__(self, stream, shutdown):
        self.stream, self.shutdown = stream, shutdown
        self.events = queue.Queue(maxsize=128)
        self.lock = threading.Lock()
        self.pending_frame = None
        self.wake = threading.Event()
        self.finished = threading.Event()
        self.thread = threading.Thread(target=self.write, name="pokeft8-json", daemon=True)
        self.thread.start()

    def emit(self, event):
        if event["type"] == "frame":
            with self.lock:
                self.pending_frame = event
        else:
            try:
                self.events.put_nowait(event)
            except queue.Full:
                # A host that stops reading is unresponsive; don't accumulate memory.
                self.shutdown.set()
        self.wake.set()

    def write(self):
        try:
            while True:
                self.wake.wait(0.1)
                self.wake.clear()
                while True:
                    try:
                        event = self.events.get_nowait()
                    except queue.Empty:
                        break
                    self.stream.write(json.dumps(event, ensure_ascii=True, allow_nan=False) + "\n")
                with self.lock:
                    frame, self.pending_frame = self.pending_frame, None
                if frame:
                    self.stream.write(json.dumps(frame, ensure_ascii=True) + "\n")
                self.stream.flush()
                if self.finished.is_set() and self.events.empty():
                    return
        except (OSError, ValueError):
            self.shutdown.set()

    def close(self):
        self.finished.set()
        self.wake.set()
        self.thread.join(timeout=1)


def run(args, stream, emit, shutdown):
    # NumPy/PyBoy native imports inspect the Windows CRT's stdin descriptor.
    # Starting a blocking stdin-reader thread first can hold that descriptor's
    # lock indefinitely and deadlock the import until another command arrives.
    # Import native dependencies first; the reader still starts before ROM
    # preparation, so the expensive bootstrap remains cancellable.
    runtime_factory = create_red
    try:
        import rom  # noqa: F401
    except Exception as exc:
        runtime_error = str(exc)

        def unavailable_red(*_args):
            raise RuntimeError(runtime_error)

        runtime_factory = unavailable_red
    mailbox = Mailbox(emit, shutdown)
    reader = threading.Thread(
        target=mailbox.read, args=(stream,), name="pokeft8-input", daemon=True
    )
    reader.start()
    controller = Controller(
        args.data_dir, emit, cancelled=shutdown.is_set, red_factory=runtime_factory
    )
    try:
        if args.rom and not shutdown.is_set():
            try:
                controller.start(args.rom, args.mode)
            except InterruptedError:
                return
            except Exception as exc:
                emit({"type": "error", "message": str(exc), "command": "start"})
        elif not shutdown.is_set():
            emit({"type": "ready", "protocol": PROTOCOL_VERSION, "running": False})
        last_pump = time.monotonic()
        last_render = last_status = 0.0
        while not shutdown.is_set():
            for _ in range(16):
                try:
                    command = mailbox.controls.get_nowait()
                except queue.Empty:
                    break
                try:
                    if command.get("command") in (
                        "start",
                        "configure",
                        "mode",
                        "restart",
                    ):
                        mailbox.clear_packets()
                    controller.command(command)
                    emit(
                        {
                            "type": "ack",
                            "command": command.get("command"),
                            "id": command.get("id"),
                        }
                    )
                    last_status = 0.0
                except InterruptedError:
                    shutdown.set()
                    break
                except Exception as exc:
                    emit(
                        {
                            "type": "error",
                            "message": str(exc),
                            "command": command.get("command"),
                            "id": command.get("id"),
                        }
                    )
            for _ in range(200):
                try:
                    packet = mailbox.packets.get_nowait()
                except queue.Empty:
                    break
                if controller.mode == "live":
                    controller.ingest(packet)
            controller.dropped_packets = mailbox.dropped
            current = time.monotonic()
            controller.advance(current - last_pump)
            last_pump = current
            if current - last_status >= 0.25:
                emit(controller.snapshot())
                last_status = current
            if current - last_render >= 1 / args.fps:
                frame = controller.frame()
                if frame:
                    emit(frame)
                last_render = current
            shutdown.wait(0.008)
    finally:
        controller.close()
        emit({"type": "stopped"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rom", help="Path to your supported English Pokemon Red ROM")
    parser.add_argument("--data-dir", type=Path, help="Writable per-user PokeFT8 folder")
    parser.add_argument("--mode", choices=("demo", "live"), default="demo")
    parser.add_argument("--fps", type=int, choices=range(15, 31), default=20)
    parser.add_argument("--self-test", action="store_true", help="ROM-free packaged-runtime check")
    args = parser.parse_args()
    if not args.self_test and args.data_dir is None:
        parser.error("--data-dir is required unless --self-test is used")
    # Preserve a dedicated protocol descriptor before redirecting both Python and
    # native-library stdout to stderr. No emulator banner can corrupt the pipe.
    stream = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    if args.self_test:
        result = {"type": "self-test", "protocol": PROTOCOL_VERSION, "ok": False}
        try:
            import numpy
            import sdl2
            from PIL import Image
            from pyboy import PyBoy

            from prepare_reference import SHA256
            from runtime_paths import BUNDLE_ROOT

            reference = BUNDLE_ROOT / "reference" / "pokered.sym"
            if hashlib.sha256(reference.read_bytes()).hexdigest() != SHA256:
                raise ValueError("Bundled emulator symbol checksum is invalid")
            # Import and exercise native-array/image dependencies without loading a ROM.
            sample = numpy.zeros((144, 160, 3), dtype=numpy.uint8)
            image = Image.fromarray(sample)
            result.update(
                ok=bool(PyBoy and sdl2.SDL_InitSubSystem and image.size == (160, 144)),
                symbols_verified=True,
                width=160,
                height=144,
                numpy=numpy.__version__,
                pillow=Image.__version__,
            )
        except Exception as exc:
            result["message"] = str(exc)
        stream.write(json.dumps(result) + "\n")
        stream.flush()
        return 0 if result["ok"] else 1
    shutdown = threading.Event()
    output = ProtocolOutput(stream, shutdown)
    try:
        run(args, sys.stdin.buffer, output.emit, shutdown)
    except Exception as exc:
        output.emit({"type": "error", "message": str(exc), "command": "worker"})
        raise SystemExit(1) from exc
    finally:
        shutdown.set()
        output.close()


if __name__ == "__main__":
    raise SystemExit(main())
