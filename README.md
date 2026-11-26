# Thanksgiving Bingo

A mobile-first 75-ball Bingo caller and live call board built with **Effect 4**, **Foldkit**, **Tailwind CSS 4**, and **Node 24 built-in SQLite** (`node:sqlite`).

Designed for family gatherings using physical Bingo cards: one person runs the **Caller** controls (drawing balls or tapping numbers from a physical cage), while everyone else follows the read-only **Live board** on their phones or a TV over live Server-Sent Events (SSE).

## Features

- **Live board (read-only):** Big current ball display, last 5 calls, round pattern preview, **All 1–75 / Called only** toggle, and a mobile-first 5-column `B-I-N-G-O` layout.
- **Caller controls (PIN-protected):** Draw random balls (`Effect/Random`), tap any number on the 1–75 board manually, undo, optional browser voice callout, round pattern presets + tap-to-edit custom patterns, and new-game confirmation.
- **4 color schemes:** Pine Felt, Parchment, High Contrast, and Hearth (saved per device).
- **Print cards:** Optional 2-up printable card sheet generator.
- **Zero-dependency production server:** Single Node 24 binary (`bin/bingo-server`) backed by SQLite with signed `HttpOnly` cookie auth and optional room invite code (`BINGO_INVITE_CODE` + `/?join=<code>`).

## Development

```sh
nix develop
pnpm install
pnpm run dev
```

Run checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format
ast-grep scan src test
pnpm run test
```

## Production / NixOS

Build and run with Nix:

```sh
nix build .#bingo
BINGO_CALLER_PIN=2468 ./result/bin/bingo-server
```

Or import `nixosModules.default` in a NixOS flake and enable `services.bingo`.
