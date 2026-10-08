"""ROM-free checks for the embedded worker boundary and session lifecycle."""

import base64
import json
import math
import queue
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

import protocol as wire
from bridge import Controller, Mailbox, validate_power
from demo import real_sequence


class FakeAudio:
    enabled = False

    def enable(self, enabled):
        self.enabled = enabled

    def clear(self):
        pass


class FakeRed:
    def __init__(self, path, clock, data_dir, cancelled):
        self.path, self.clock, self.data_dir = path, clock, data_dir
        self.cancelled = cancelled
        self.audio = FakeAudio()
        self.mode = "idle"
        self.error = ""
        self.watts = 50
        self.actions = []
        self.frames = 0
        self.closed = False

    def action(self, action):
        self.actions.append(action)

    def tick(self, frames):
        self.frames += frames

    def close(self):
        self.closed = True


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.rom = self.root / "owned.gb"
        self.rom.write_bytes(b"Fake for controller tests; never passed to an emulator")
        self.now = [0.0]
        self.events = []
        self.controller = Controller(
            self.root / "user",
            self.events.append,
            red_factory=FakeRed,
            clock=lambda: self.now[0],
        )

    def tearDown(self):
        self.controller.close()
        self.folder.cleanup()

    def start(self, mode="demo"):
        self.controller.command({"command": "start", "rom": str(self.rom), "mode": mode})

    def test_demo_replays_binary_packets_and_keeps_database_in_memory(self):
        self.start()
        for timestamp, _ in real_sequence(missed_reply=True):
            self.now[0] = timestamp
            self.controller.advance(0.01)
        status = self.controller.snapshot()
        self.assertEqual(status["state"], "success")
        self.assertEqual(status["opponent"], "JA1ABC")
        self.assertEqual(len(status["collection"]), 1)
        self.assertEqual(status["collection"][0]["species"], self.controller.engine.species)
        self.assertFalse((self.root / "user" / "contacts.sqlite3").exists())
        self.assertTrue(any(action.get("missed") for action in self.controller.red.actions))
        self.controller.command({"command": "restart"})
        self.assertEqual(self.controller.snapshot()["collection"], [])

    def test_live_database_is_user_local_and_preserved_across_demo(self):
        self.start("live")
        for _, packet in real_sequence():
            self.controller.ingest(packet)
        self.assertEqual(len(self.controller.engine.dex.collection()), 1)
        self.assertTrue((self.root / "user" / "contacts.sqlite3").exists())
        self.controller.command({"command": "mode", "mode": "demo"})
        self.assertEqual(self.controller.snapshot()["collection"], [])
        self.controller.command({"command": "mode", "mode": "live"})
        status = self.controller.snapshot()
        self.assertEqual(len(status["collection"]), 1)
        self.assertEqual(status["state"], "idle")
        self.assertIsNone(self.controller.engine.instance)

    def test_pause_freezes_demo_clock_and_resume_keeps_the_same_elapsed_time(self):
        self.start()
        self.now[0] = 5
        self.controller.command({"command": "pause", "paused": True})
        self.now[0] = 100
        self.controller.advance(0.25)
        self.assertEqual(self.controller.session_clock(), 5)
        self.assertEqual(self.controller.red.frames, 0)
        self.controller.command({"command": "pause", "paused": False})
        self.assertEqual(self.controller.session_clock(), 5)
        self.now[0] = 102
        self.assertEqual(self.controller.session_clock(), 7)
        self.controller.command({"command": "mode", "mode": "live"})
        with self.assertRaisesRegex(ValueError, "only during a running demo"):
            self.controller.command({"command": "pause", "paused": True})

    def test_power_validation_preserves_host_settings(self):
        self.start()
        settings = self.root / "user" / "settings.json"
        original = {"watts": 100, "romPath": str(self.rom), "mode": "live"}
        settings.write_text(json.dumps(original))
        self.controller.command({"command": "power", "watts": 100})
        self.assertEqual(self.controller.engine.watts, 100)
        self.assertEqual(self.controller.red.watts, 100)
        self.assertEqual(json.loads(settings.read_text()), original)
        for value in (None, True, -1, 0, 1501, math.inf, math.nan, "watts"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.controller.command({"command": "power", "watts": value})
        self.assertEqual(self.controller.watts, 100)
        self.assertEqual(validate_power("0.1"), 0.1)
        restarted = Controller(
            self.root / "user",
            self.events.append,
            red_factory=FakeRed,
            clock=lambda: self.now[0],
        )
        self.assertEqual(restarted.watts, 100)
        restarted.close()

    def test_invalid_commands_do_not_abandon_the_active_session(self):
        self.start()
        original = self.controller.red
        for command in (
            {"command": "mode", "mode": "invalid"},
            {"command": "start", "rom": "missing-file.gb"},
            {"command": "sound", "enabled": "true"},
            {"command": "pause", "paused": 1},
            {"command": "unknown"},
        ):
            with self.subTest(command=command), self.assertRaises(ValueError):
                self.controller.command(command)
        self.assertIs(self.controller.red, original)
        self.assertFalse(original.closed)

    def test_bad_live_packets_are_counted_without_crashing(self):
        self.start("live")
        self.controller.ingest(b"bad packet")
        self.controller.ingest(wire.status())
        status = self.controller.snapshot()
        self.assertEqual(status["packet_count"], 1)
        self.assertEqual(status["bad_packets"], 1)
        self.assertEqual(status["own"], "N0CALL")

    def test_restarting_closes_old_emulator(self):
        self.start()
        old = self.controller.red
        self.start("live")
        self.assertTrue(old.closed)
        self.assertEqual(self.events[-1]["type"], "ready")
        self.assertEqual(self.events[-1]["protocol"], 1)
        self.assertEqual(self.controller.red.data_dir, self.root / "user")
        self.assertEqual(
            self.rom.read_bytes(),
            b"Fake for controller tests; never passed to an emulator",
        )


class MailboxTests(unittest.TestCase):
    def setUp(self):
        self.shutdown = threading.Event()
        self.events = []
        self.mailbox = Mailbox(self.events.append, self.shutdown, packet_limit=2, control_limit=1)

    def test_telemetry_bursts_never_fill_the_control_queue(self):
        data = base64.b64encode(wire.status()).decode()
        for _ in range(10):
            self.mailbox.receive({"command": "packet", "data": data})
        self.mailbox.receive({"command": "restart", "id": 7})
        self.assertEqual(self.mailbox.packets.qsize(), 2)
        self.assertEqual(self.mailbox.dropped, 8)
        self.assertEqual(self.mailbox.controls.get_nowait()["id"], 7)
        self.mailbox.clear_packets()
        self.assertTrue(self.mailbox.packets.empty())

    def test_shutdown_bypasses_saturated_control_queue(self):
        self.mailbox.receive({"command": "restart"})
        with self.assertRaises(ValueError):
            self.mailbox.receive({"command": "restart"})
        self.mailbox.receive({"command": "shutdown"})
        self.assertTrue(self.shutdown.is_set())

    def test_invalid_base64_and_nonobjects_are_rejected(self):
        for command in (
            [],
            None,
            {"command": "packet", "data": "!bad!"},
            {"command": "packet", "data": ""},
            {"command": "packet", "data": 12},
        ):
            with self.subTest(command=command), self.assertRaises(ValueError):
                self.mailbox.receive(command)


class PipeTests(unittest.TestCase):
    def test_rom_free_pipe_is_json_only_and_shutdown_exits(self):
        with tempfile.TemporaryDirectory() as folder:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-u",
                    str(Path(__file__).with_name("bridge.py")),
                    "--data-dir",
                    folder,
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
            )
            received = queue.Queue()

            def reader():
                for line in process.stdout:
                    received.put(json.loads(line))

            thread = threading.Thread(target=reader, daemon=True)
            thread.start()
            try:
                self.assertEqual(received.get(timeout=10)["type"], "ready")
                # A later start used to deadlock on Windows when NumPy's native
                # import inspected stdin while the reader thread held its CRT
                # descriptor lock. An invalid cartridge exercises the import
                # path and error response without distributing a real ROM.
                invalid_rom = Path(folder) / "invalid.gb"
                invalid_rom.write_bytes(b"Not a cartridge")
                process.stdin.write(
                    json.dumps({"command": "start", "rom": str(invalid_rom), "id": 41}) + "\n"
                )
                process.stdin.flush()
                while True:
                    event = received.get(timeout=10)
                    if event["type"] == "error":
                        break
                self.assertEqual(event["id"], 41)
                self.assertEqual(event["command"], "start")
                process.stdin.write('{"command":"restart","id":42}\n')
                process.stdin.flush()
                while True:
                    event = received.get(timeout=10)
                    if event["type"] == "error":
                        break
                self.assertEqual(event["id"], 42)
                self.assertIn("Start the emulator", event["message"])
                process.stdin.write('{"command":"shutdown"}\n')
                process.stdin.flush()
                process.wait(timeout=10)
                self.assertEqual(process.returncode, 0)
                thread.join(timeout=2)
                remaining = []
                while not received.empty():
                    remaining.append(received.get_nowait())
                self.assertTrue(any(item["type"] == "stopped" for item in remaining))
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)
                process.stdin.close()
                process.stdout.close()
                process.stderr.close()


if __name__ == "__main__":
    unittest.main()
