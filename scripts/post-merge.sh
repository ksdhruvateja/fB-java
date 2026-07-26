#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[post-merge] Building frontend..."
pnpm build

echo "[post-merge] Done."
