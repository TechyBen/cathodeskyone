#!/usr/bin/env bash
# Rebuild the voice (ext/term/voice/) from CHIMERA
# (https://github.com/jamesondh/chimera-vocal-synth, MIT):
#   chimera.wasm   the engine, Rust compiled for wasm32-unknown-unknown
#   worklet.js     its AudioWorklet processor, bundled to one file by Bun
#   cmudict.txt.gz the CMU Pronouncing Dictionary (its own licence alongside)
#
#   tools/build_voice.sh [path to a chimera-vocal-synth checkout]
#
# Needs Rust with the wasm32-unknown-unknown target, and Bun.
set -euo pipefail
SRC="${1:-../chimera-vocal-synth}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/ext/term/voice"
mkdir -p "$OUT"
( cd "$SRC" && cargo build -p chimera-wasm --release --target wasm32-unknown-unknown )
TARGET="${CARGO_TARGET_DIR:-$SRC/target}"
cp "$TARGET/wasm32-unknown-unknown/release/chimera_wasm.wasm" "$OUT/chimera.wasm"
bun build "$SRC/src/worklet/processor.ts" --outfile "$OUT/worklet.js" --target browser --format esm
cp "$SRC/public/data/cmudict.txt.gz" "$SRC/public/data/CMUDICT-LICENSE.txt" "$OUT/"
cp "$SRC/LICENSE" "$OUT/LICENSE-chimera.txt"
echo "built from $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo "$SRC")"
