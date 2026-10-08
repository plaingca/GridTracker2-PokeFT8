# The worker needs a console subsystem for pipes; Electron hides its Windows console.
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

project = Path(SPECPATH)
datas = [(str(project / "reference" / "pokered.sym"), "reference")]
binaries = []
hiddenimports = []
for package in ("pyboy", "sdl2", "sdl2dll"):
    package_data, package_binaries, package_imports = collect_all(package)
    if sys.platform == "darwin" and package == "sdl2dll":
        def core_sdl_file(item):
            path = Path(item[0]).as_posix()
            return "/dll/" not in path or "/dll/SDL2.framework/" in path

        package_data = [item for item in package_data if core_sdl_file(item)]
        package_binaries = [item for item in package_binaries if core_sdl_file(item)]
    datas += package_data
    binaries += package_binaries
    hiddenimports += package_imports

a = Analysis(
    [str(project / "bridge.py")],
    pathex=[str(project)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    runtime_hooks=[str(project / "runtime_sdl.py")],
    excludes=["tkinter", "pytest", "IPython"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="PokeFT8Bridge",
    console=True,
    upx=False,
)
bundle = COLLECT(exe, a.binaries, a.datas, name="PokeFT8Bridge", upx=False)
