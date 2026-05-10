#!/usr/bin/env bash
set -euo pipefail

mkdir -p dist

# deno targets. these values defined by deno. 
TARGETS=(
  x86_64-unknown-linux-gnu
  aarch64-unknown-linux-gnu
  x86_64-apple-darwin
  aarch64-apple-darwin
)

# creating a .tar.gz for each target in format mise github backend expects. 
for t in "${TARGETS[@]}"; do
  outdir="dist/pr-updater-$t"
  mkdir -p "$outdir"

  deno compile --output "$outdir/pr-updater" --allow-all --target "$t" main.ts

  (
    cd "$outdir"
    tar -czf "../pr-updater-$t.tar.gz" pr-updater
  )
done
