# spacecake

`spacecake` is an open-source desktop app for Claude Code.  
It combines an integrated terminal, visual markdown editor, and live task tracking.  
You can run agents, write specs, and see what's happening in one place.

For full documentation, visit [spacecake.ai](https://www.spacecake.ai/getting-started).

> ℹ️ `spacecake` is in public alpha. Supported platforms: macOS (Apple Silicon & Intel), Windows (x64), and Linux (x64).
> If you find any bugs, please open an issue in this repo or join us on [Discord](https://discord.com/invite/CwFnxfkGHB).

### 📦 project structure

This is a monorepo:

| folder | description |
| --- | --- |
| `spacecake-app/` | desktop app |
| `website/` | landing page & docs ([spacecake.ai](https://www.spacecake.ai/)) |
| `cli/` | command-line tool |

### 🚀 getting started

Download an installer for your platform from the [latest release](https://github.com/spacecake-labs/spacecake/releases):

- **macOS**: Download the `.dmg` file (arm64 for Apple Silicon, x64 for Intel)
- **Windows**: Download the `.exe` installer
- **Linux**: Download the `.deb` file (for Debian-based distributions like Ubuntu) or `.AppImage` for other distros
- **macOS (ZIP)**: Download the `.zip` file for manual installation

> **linux & windows users**: for best file watching performance, install [watchman](https://facebook.github.io/watchman/docs/install). spacecake will show a tip in the status bar recommending this.

On first launch, spacecake opens the home folder (`~/.spacecake`) for general notes.
Press `⌘O` (macOS) or `ctrl+O` (Windows/Linux) to open your project as a workspace.

#### keyboard shortcuts

| shortcut | action |
| --- | --- |
| `⌘O` | open workspace |
| `⌘P` | quick open file |
| `⌘N` | new file |
| `` ctrl+` `` | toggle terminal |
| `ctrl+G` | open plans |

See the [full keyboard shortcuts list](https://www.spacecake.ai/getting-started#keyboard-shortcuts) for more.

### 📖 markdown features

- *proper* code blocks with syntax highlighting and your favourite keyboard shortcuts (`ctrl+D`, anyone?)
- checklists and badges for agent execution plans
- diagrams with [mermaid](https://mermaid.js.org/)
- WYSIWYG and 'live preview' modes
- autosave (enable in workspace settings)
- URL links for external resources

### 🖥️ integrated terminal

`spacecake` comes with [Ghostty](https://ghostty.org/) terminal embedded.

- run your favourite CLI agents ([Claude Code](https://github.com/anthropics/claude-code), [Codex](https://github.com/openai/codex), [Gemini](https://github.com/google-gemini/gemini-cli))
- go beyond vibe-coding with [Spec Kit](https://github.com/github/spec-kit)

#### Claude Code integration

`spacecake` provides deep integration with Claude Code:

- **context awareness**: tells Claude which file and line you're editing
- **plan mode**: enabled by default when running in the spacecake terminal
- **status line**: shows live metrics (model, context %, cost)
- **plans panel**: press `ctrl+G` to view and manage plans

See the [Claude Code integration docs](https://www.spacecake.ai/getting-started#claude-code) for more details.

### 🧑‍💻 code-editing features

`spacecake` uses [CodeMirror](https://codemirror.net/) internally to provide a rich code-editing experience:

- syntax highlighting
- autocompletion
- bracket closing
- code folding
- linting
- the usual keyboard shortcuts\

## Star History

<a href="https://www.star-history.com/#spacecake-labs/spacecake&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=spacecake-labs/spacecake&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=spacecake-labs/spacecake&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=spacecake-labs/spacecake&type=date&legend=top-left" />
 </picture>
</a>

## Product Hunt
<a href="https://www.producthunt.com/products/spacecake/reviews/new?utm_source=badge-product_review&utm_medium=badge&utm_source=badge-spacecake" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/product_review.svg?product_id=1157919&theme=light" alt="spacecake - Run&#0032;Claude&#0032;Code&#0032;agents&#0032;in&#0032;terminal&#0032;with&#0032;a&#0032;visual&#0032;editor | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
