"""Build a self-contained worker and verify its ROM-free startup and contents."""

import hashlib
import importlib.metadata as metadata
import json
import subprocess
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
FORBIDDEN = {".gb", ".gbc", ".sav", ".ram", ".state", ".sqlite", ".sqlite3", ".log"}


def check_contents(folder):
    for path in folder.rglob("*"):
        if path.is_file() and (path.suffix.lower() in FORBIDDEN or path.name.startswith(".env")):
            raise RuntimeError(f"Game or private content in bundle: {path.relative_to(folder)}")


def notices(folder):
    target_root = folder / "third-party-licenses"
    for name in ("pyboy", "numpy", "pillow", "PySDL2", "pysdl2-dll", "pyinstaller"):
        dist = metadata.distribution(name)
        for file in dist.files or []:
            if any(word in file.name.lower() for word in ("license", "copying", "notice")):
                source = Path(dist.locate_file(file))
                if source.is_file() and source.suffix.lower() not in (".py", ".pyc", ".pyd"):
                    # License-only copies are not native frameworks. Keeping that
                    # suffix makes Electron's macOS signer try to sign fake bundles.
                    notice_path = Path(
                        *(part.replace(".framework", ".framework-notices") for part in file.parts)
                    )
                    target = target_root / name / notice_path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(source.read_bytes())
    (folder / "THIRD-PARTY-PokeFT8.md").write_bytes(
        (PROJECT.parent / "THIRD-PARTY-PokeFT8.md").read_bytes()
    )


def main():
    from prepare_reference import SHA256

    symbols = PROJECT / "reference" / "pokered.sym"
    if not symbols.is_file() or hashlib.sha256(symbols.read_bytes()).hexdigest() != SHA256:
        raise RuntimeError("Run python pokeft8/prepare_reference.py first")
    subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "PokeFT8Bridge.spec"],
        cwd=PROJECT,
        check=True,
    )
    bundle = PROJECT / "dist" / "PokeFT8Bridge"
    executable = bundle / ("PokeFT8Bridge.exe" if sys.platform == "win32" else "PokeFT8Bridge")
    result = subprocess.run(
        [str(executable), "--self-test"],
        cwd=PROJECT.parent,
        capture_output=True,
        text=True,
        timeout=90,
        check=True,
    )
    report = json.loads(result.stdout)
    if not report.get("ok"):
        raise RuntimeError(f"Frozen startup failed: {report}")
    notices(bundle)
    check_contents(bundle)
    print(f"Verified frozen worker: {executable}")


if __name__ == "__main__":
    main()
