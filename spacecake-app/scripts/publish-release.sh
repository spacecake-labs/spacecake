#!/bin/bash
set -euo pipefail
# Override GITHUB_TOKEN for electron-forge publish
# Changesets action uses GITHUB_TOKEN for PR creation,
# but electron-forge needs it set to PUBLIC_REPO_ACCESS_TOKEN
export GITHUB_TOKEN="$PUBLIC_REPO_ACCESS_TOKEN"

# Build for the specified architecture
ARCH="${BUILD_ARCH:-arm64}"
pnpm run publish -- --arch="$ARCH"

