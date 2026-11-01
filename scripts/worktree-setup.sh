#!/usr/bin/env bash
# Install the dependencies of the billet workspace from the lock and build the
# Rust addon. Run from anywhere; it works on the directory its own file sits in.
#
# Usage: scripts/worktree-setup.sh
#
# Exit: 0 the install and the build worked, non-zero what failed said.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

npm ci --no-audit --no-fund
cargo build --release --locked -p example
cp target/release/libexample.so crates/example/example.node
