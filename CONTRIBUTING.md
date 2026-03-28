# contributing to spacecake

thanks for your interest in contributing to spacecake! this guide covers building from source and running the app locally.

> if you just want to **use** spacecake, download an installer from the [latest release](https://github.com/spacecake-labs/spacecake/releases).

## prerequisites

you'll need the following tools installed:

| tool | version | install |
| --- | --- | --- |
| [Git](https://git-scm.com) | any recent version | [git-scm.com](https://git-scm.com) |
| [Node.js](https://nodejs.org) | 20 LTS | `brew install node@20` / `winget install OpenJS.NodeJS.LTS` / [nodejs.org](https://nodejs.org) |
| [pnpm](https://pnpm.io) | 10 | `npm install -g pnpm@10` |
| [just](https://just.systems) | any recent version | `brew install just` / `cargo install just` / [just.systems](https://just.systems) |

### platform-specific: C/C++ compiler toolchain

some dependencies (tree-sitter, @parcel/watcher) include native modules that need a C/C++ compiler.

<details>
<summary><strong>macOS</strong></summary>

install Xcode Command Line Tools:

```bash
xcode-select --install
```

this provides `clang`, `clang++`, and `make`.

if you have multiple clang installations (e.g. from Homebrew), make sure the system toolchain is used:

```bash
export CC="$(xcode-select -p)/usr/bin/clang"
export CXX="$(xcode-select -p)/usr/bin/clang++"
```

</details>

<details>
<summary><strong>Windows</strong></summary>

install Visual Studio 2022 Build Tools with the "Desktop Development with C++" workload.

quick install via `winget`:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --source winget --override "--add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows11SDK.22621"
```

then tell npm which version to use:

```powershell
npm config set msvs_version 2022
```

</details>

<details>
<summary><strong>Linux (Debian/Ubuntu)</strong></summary>

```bash
sudo apt-get install build-essential python3
```

for best file watching performance, also install [watchman](https://facebook.github.io/watchman/docs/install):

```bash
sudo apt-get install watchman
```

</details>

## build and run

```bash
git clone https://github.com/spacecake-labs/spacecake.git
cd spacecake/spacecake-app
pnpm install
just start
```

this launches a dev build in a separate Electron window. data is stored in `~/.spacecake-dev/` (doesn't overlap with the official `~/.spacecake`).

## checks and tests

all commands are run from the `spacecake-app/` directory:

| command | what it does |
| --- | --- |
| `just check` | runs the formatter, linter, and type checker |
| `just unit` | runs unit and integration tests |
| `just e2e` | runs end-to-end tests (builds the app first) |
| `just test` | runs unit + e2e tests |
| `just ci` | runs checks + all tests (same as CI) |

please run `just check` before submitting a pull request.

## project structure

| folder | description |
| --- | --- |
| `spacecake-app/` | desktop app (Electron + React) |
| `website/` | landing page & docs ([spacecake.ai](https://www.spacecake.ai/)) |
| `cli/` | command-line tool (built with Bun) |

each folder has a `justfile` with the same `start`, `check`, `unit`, and `e2e` commands.

## troubleshooting

### macOS: C++ header errors during `pnpm install`

if you see errors about missing C++ headers (common on macOS Sequoia with outdated Command Line Tools), update them:

```bash
xcode-select --install
```

if that doesn't help, reset the active developer directory:

```bash
sudo xcode-select --reset
```

you can verify your toolchain is working with:

```bash
xcode-select -p
# should print: /Library/Developer/CommandLineTools (or /Applications/Xcode.app/Contents/Developer)
```

### node-gyp failures

if native module compilation fails, try clearing the node-gyp cache:

- **macOS**: `rm -rf ~/Library/Caches/node-gyp/`
- **Linux**: `rm -rf ~/.cache/node-gyp`
- **Windows**: delete `%USERPROFILE%\AppData\Local\node-gyp`

then re-run `pnpm install`.

### general build failures

if the build gets into a broken state:

```bash
rm -rf node_modules
pnpm install
```

## dev container

a [dev container](https://containers.dev/) configuration is included in `.devcontainer/` for use with VS Code or GitHub Codespaces. this is useful for editing code and running checks/tests, but not for running the Electron GUI (which requires a native display).

## code style

- lowercase text in the UI and in code comments, unless it's a proper noun
- no real names, usernames, or real file paths in code, comments, or tests — use generic placeholders
- run `just check` before submitting
