"""Find the bundled SDL shared libraries in the frozen worker."""

import os
import sys
from pathlib import Path

os.environ["PYSDL2_DLL_PATH"] = str(Path(sys._MEIPASS) / "sdl2dll" / "dll")
