# spacecake

`spacecake` is a WYSIWYG markdown editor built for Claude Code.
It combines a visual markdown editor with an integrated terminal, so you can run Claude Code (or other CLI agents) right alongside your specs.
You can also navigate your codebase, with support for 10+ popular languages.

> ℹ️ `spacecake` is in public alpha. Supported platforms: macOS (Apple Silicon & Intel) and Linux (x64).
> If you find any bugs, please open an issue in this repo.

### 🚀 getting started

Download an installer for your platform from the [latest release](https://github.com/spacecake-labs/spacecake/releases):

- **macOS**: Download the `.dmg` file (arm64 for Apple Silicon, x64 for Intel)
- **Linux**: Download the `.deb` file (for Debian-based distributions like Ubuntu)
- **macOS (ZIP)**: Download the `.zip` file for manual installation

Once installed, you'll be prompted to open a folder. Select the root dir for your existing codebase.

### 📖 markdown features

- *proper* code blocks with syntax highlighting and your favourite keyboard shortcuts (`ctrl+D`, anyone?)
- checklists and badges for agent execution plans
- diagrams with [mermaid](https://mermaid.js.org/)
- WYISWYG and 'live preview' modes
- URL links for external resources

### 🖥️ integrated terminal

`spacecake` comes with [Ghostty](https://ghostty.org/) terminal embedded.

- run your favourite CLI agents ([Claude Code](https://github.com/anthropics/claude-code), [Codex](https://github.com/openai/codex), [Gemini](https://github.com/google-gemini/gemini-cli))
- Claude Code integration: `spacecake` tells Claude which file and line you're editing
- go beyond vibe-coding with [Spec Kit](https://github.com/github/spec-kit)

### 🧑‍💻 code-editing features

`spacecake` uses [CodeMirror](https://codemirror.net/) internally to provide a rich code-editing experience:

- syntax highlighting
- autocompletion
- bracket closing
- code folding
- linting
- the usual keyboard shortcuts
