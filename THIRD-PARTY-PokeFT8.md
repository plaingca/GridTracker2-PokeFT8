# Attribution for the PokeFT8 integration

GridTracker2 source and history originate from
[GridTracker.org/GridTracker2](https://gitlab.com/gridtracker.org/gridtracker2),
commit `ed4697c03d0d3585b87acc8b417a1f6cc2ddeaf4` (version 2.260925.2).
Its BSD 3-Clause copyright notice and license are preserved in `LICENSE`.

The QSO engine, ecology, WSJT-X parser, emulator adapter and audio implementation
originate from [plaingca/PokeFT8](https://github.com/plaingca/PokeFT8),
commit `a7a75a109549b8bbf709300dcf2bbd8e75474ca6`.
The private integration was made at the repository owner's request. PokeFT8 did
not include a separate license grant at import; its inclusion does not grant
additional redistribution rights for that source or the original game.

The worker bundles PyBoy 2.8.1 (LGPL-3.0), NumPy, Pillow, PySDL2 and the SDL2
runtime from pysdl2-dll. Their installed notices are copied into
`pokeft8/third-party-licenses` in packaged applications. PyBoy source is available
at https://github.com/Baekalfen/PyBoy/tree/v2.8.1; the worker's Python source and
build instructions are included in this repository.

Checksum-pinned symbols come from [pret/pokered](https://github.com/pret/pokered),
commit `9a0c03834a435e38564445053ae9f9ece9999909`; see
`pokeft8/prepare_reference.py` for the exact download and verification.

No Pokemon ROM, cartridge save, generated game state, contacts, credentials or
game screenshots are included in source commits or distributable packages.
Nintendo and The Pokemon Company retain their rights in Pokemon. This is an
unofficial integration without endorsement by them or the GridTracker team.
