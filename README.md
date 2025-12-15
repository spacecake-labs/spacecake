# spacecake
`spacecake` is a markdown editor for spec-driven development.
Its WYSIWYG interface makes it easy to write agent rules, specs, and implementation plans.
With `Python` and `TypeScript` support baked in, you can navigate your codebase to resolve the trickier issues.
> ⚠️ `spacecake` is in public alpha and is currently only bundled for macOS.
> If you find any bugs, please open an issue in this repo.
### 🚀 getting started
Download the `dmg` or `zip` installer from the [latest release](https://github.com/spacecake-labs/spacecake-releases/releases).
Once installed, you'll be prompted to open a folder. Select the root dir for your existing codebase.
### 📖 markdown features
- *proper* code blocks with syntax highlighting and your favourite keyboard shortcuts (`ctrl+D`, anyone?)
- checklists and badges for agent execution plans
- diagrams with [mermaid](https://mermaid.js.org/)
- WYISWYG and 'live preview' modes
- URL links for external resources
### 🧑‍💻 code-editing features
`spacecake` uses [CodeMirror](https://codemirror.net/) internally to provide a rich code-editing experience:
- syntax highlighting
- autocompletion
- bracket closing
- code folding
- linting
- the usual keyboard shortcuts