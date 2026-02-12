export const GETTING_STARTED_CONTENT = `# welcome to spacecake

spacecake is a WYSIWYG markdown editor with an integrated terminal, built for Claude Code and other CLI agents.

## 📖 quick start

- **open a project**: press \`⌘O\` (or \`ctrl+o\` on Windows/Linux) to open your project's root directory
- **quick open**: press \`⌘P\` to search and open files
- **create a new file**: press \`⌘N\` to create a new file
- **toggle terminal**: press \`ctrl+\`\` to show/hide the terminal

## ⌨️ keyboard shortcuts

| action | macos | windows/linux |
|--------|-------|---------------|
| open/switch workspace | \`⌘O\` | \`ctrl+o\` |
| quick open file | \`⌘P\` | \`ctrl+p\` |
| new file | \`⌘N\` | \`ctrl+n\` |
| save file | \`⌘S\` | \`ctrl+s\` |
| close tab | \`⌘W\` | \`ctrl+w\` |
| toggle terminal | \`ctrl+\`\` | \`ctrl+\`\` |
| focus editor | \`⌘1\` | \`ctrl+1\` |

## 🏠 your home folder

this is your spacecake home folder (\`~/.spacecake\`). you can:

- create notes and folders here
- organize your files however you like
- open any project folder as a workspace anytime

the \`.app\` folder contains spacecake system files - feel free to ignore it.

## 🖥️ terminal

the integrated terminal is at the bottom of the screen. click it or drag to resize.

- powered by [Ghostty](https://ghostty.org/)
- run any CLI tool, including Claude Code

## 🦀 claude code integration

run \`claude\` from the integrated terminal - it automatically connects to spacecake and defaults to plan mode.

### plan mode & ctrl+g

when Claude creates a plan, press \`ctrl+g\` in the terminal to open it in spacecake. the tab shows a green "claude" badge, and you'll see **save & close** / **close** buttons to return to Claude when done.

### troubleshooting connection

if Claude shows "IDE disconnected", run \`/ide\` to check the connection status. you should see spacecake listed and can select it to reconnect.

a green **claude** badge in the status bar indicates an active session is connected.

## 📝 writing markdown

\`spacecake\` supports GitHub-flavoured markdown.

write code blocks with syntax highlighting:

\`\`\`python
def hello_world():
    print("hello from spacecake!")
\`\`\`

create execution plans with checklists:

\`\`\`markdown
- [ ] set up database migrations
- [ ] implement user authentication
- [ ] write integration tests
\`\`\`

embed [Mermaid](https://mermaid.js.org/) diagrams for system architecture:

\`\`\`mermaid
graph TD
    A[User Input] --> B[Validate]
    B --> C[Process]
    C --> D[Output]
\`\`\`

toggle between rich mode (WYSIWYG) and source mode (live preview) using the view toggle button in the toolbar.

## ⚙️ troubleshooting

**"permission denied" on macOS?**
go to System Settings → Privacy & Security and allow \`spacecake\` to run.

**something looks wrong?**
press \`⌘R\` to refresh the app. if the issue persists in rich mode, switch to source mode to see the underlying markdown.

**debugging issues:**
open Chrome DevTools from within \`spacecake\` to view console logs.

**slow file watching on linux or windows?**
spacecake uses @parcel/watcher for detecting file changes. on linux and windows, installing [watchman](https://facebook.github.io/watchman/) significantly improves file watching performance and reliability for large projects. spacecake will show a tip in the status bar recommending this. see the [watchman installation guide](https://facebook.github.io/watchman/docs/install) for setup instructions.

## 💬 feedback & issues

have feedback, found a bug, or want to request a feature?

- click the **chat icon** in the bottom left corner to share your thoughts directly
- open an issue on [GitHub](https://github.com/spacecake-labs/spacecake/issues)

happy writing!
`
