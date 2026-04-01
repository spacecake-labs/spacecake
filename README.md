# spacecake

`spacecake` is an open-source desktop app for Claude Code.  
It combines an integrated terminal, visual markdown editor, and live task tracking.  
You can run agents, write specs, and see what's happening in one place.

For full documentation, visit [spacecake.ai](https://www.spacecake.ai/getting-started).

> ℹ️ `spacecake` is in public alpha.
> If you find any bugs, please open an issue in this repo or join us on [Discord](https://discord.com/invite/CwFnxfkGHB).

### 🚀 getting started

Download an installer for your platform from the [latest release](https://github.com/spacecake-labs/spacecake/releases):

- **macOS**: Download the `.dmg` file (arm64 for Apple Silicon, x64 for Intel)
- **Windows**: Download the `.exe` installer
- **Linux**: Download the `.deb` file (for Debian-based distributions like Ubuntu) or `.AppImage` for other distros
- **macOS (ZIP)**: Download the `.zip` file for manual installation

> **linux & windows users**: for best file watching performance, install [watchman](https://facebook.github.io/watchman/docs/install). spacecake will show a tip in the status bar recommending this.

On first launch, spacecake opens the home folder (`~/.spacecake`) for general notes.  
Press `⌘O` (macOS) or `ctrl+O` (Windows/Linux) to open your project as a workspace.

### 📖 markdown features

- *proper* code blocks with syntax highlighting and your favourite keyboard shortcuts (`ctrl+D`, anyone?)
- slash command menu (`/`) for inserting code blocks, headings, frontmatter, and more
- frontmatter support with table and code view modes
- checklists and badges for agent execution plans
- diagrams with [mermaid](https://mermaid.js.org/)
- WYSIWYG and 'live preview' modes
- URL links for external resources

### 🖥️ integrated terminal

`spacecake` comes with [Ghostty](https://ghostty.org/) terminal embedded.

- run your favourite CLI agents ([Claude Code](https://github.com/anthropics/claude-code), [Codex](https://github.com/openai/codex), [Gemini](https://github.com/google-gemini/gemini-cli))
- go beyond vibe-coding with [Spec Kit](https://github.com/github/spec-kit)
- multi-tab support (`⌘T` / `ctrl+T` to open, `ctrl+Tab` to cycle)
- dockable left, right, or bottom

#### Claude Code integration

`spacecake` provides deep integration with Claude Code:

- **context awareness**: tells Claude which file and line you're editing
- **plan mode**: enabled by default when running in the spacecake terminal
- **status line**: auto-configured on first launch, shows live metrics (model, context %, cost)
- **plans panel**: press `ctrl+G` to view and manage plans
- **open files**: Claude can open files directly in the editor and wait for you to save and close before continuing

See the [Claude Code integration docs](https://www.spacecake.ai/getting-started#claude-code) for more details.

### 🔀 git

built-in git integration with a dockable panel:

- **changes**: view modified, staged, and untracked files with inline diffs
- **commit**: select files, write a message, and commit (with amend support)
- **branches**: create, switch, and delete branches from a popover
- **sync**: fetch, pull, and push with ahead/behind indicators
- **stash**: quick stash, pop, and drop
- **history**: browse recent commits and view per-commit diffs
- **merge conflicts**: dedicated conflict editor for resolving conflicts
- **clone / init**: clone a repo (`⌘⇧C`) or initialise a new one from the menu bar
- **GitHub**: links to view on GitHub and create pull requests

### 📋 tasks

the tasks panel shows live Claude Code tasks from the active session, with status filters and sortable columns.  
dock it left, right, or bottom alongside the terminal and git panels.

### 🧑‍💻 code-editing features

`spacecake` uses [CodeMirror](https://codemirror.net/) internally to provide a rich code-editing experience:

- syntax highlighting
- autocompletion
- bracket closing
- code folding
- linting
- the usual keyboard shortcuts

### 🔍 search

- **find in file** (`⌘F` / `ctrl+F`) — search within the current file with match highlighting, navigation, and case/word/regex toggles
- **find in workspace** (`⌘⇧F` / `ctrl+shift+F`) — ripgrep-powered search across all files, with file include/exclude filters and results grouped by file

### ⚙️ other features

- **autosave**: auto-save files on edit (enable in workspace settings)
- **light / dark mode**: toggle from the status bar

#### keyboard shortcuts

| shortcut | action |
| --- | --- |
| `⌘O` | open workspace |
| `⌘P` | quick open file |
| `⌘F` | find in file |
| `⌘⇧F` | find in workspace |
| `⌘N` | new file |
| `⌘1` | focus editor |
| `⌘B` | toggle sidebar |
| `⌘W` | close tab |
| `⌘S` | save file |
| `⌘⇧S` | save all files |
| `` ctrl+` `` | toggle terminal |
| `⌘T` | new terminal tab |
| `ctrl+G` | open plans |

See the [full keyboard shortcuts list](https://www.spacecake.ai/getting-started#keyboard-shortcuts) for more.

### 🛠️ building from source

want to contribute or build spacecake yourself? see [CONTRIBUTING.md](./CONTRIBUTING.md) for prerequisites and setup instructions.

### 📦 project structure

This is a monorepo:

| folder | description |
| --- | --- |
| `spacecake-app/` | desktop app |
| `website/` | landing page & docs ([spacecake.ai](https://www.spacecake.ai/)) |
| `cli/` | command-line tool |

### 📋 changelog

See the [desktop app changelog](spacecake-app/CHANGELOG.md) for a list of releases and changes.

## Star History

<a href="https://www.star-history.com/#spacecake-labs/spacecake&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=spacecake-labs/spacecake&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=spacecake-labs/spacecake&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=spacecake-labs/spacecake&type=date&legend=top-left" />
 </picture>
</a>

## Product Hunt
<a href="https://www.producthunt.com/products/spacecake/launches/spacecake?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-spacecake" target="_blank" rel="noopener noreferrer"><img alt="spacecake - Run Claude Code agents in terminal with a visual editor | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1072549&amp;theme=light&amp;t=1771452537430"></a>
