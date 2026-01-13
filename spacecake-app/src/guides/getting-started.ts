export const GETTING_STARTED_CONTENT = `# welcome to spacecake

spacecake is a WYSIWYG markdown editor with an integrated terminal, built for Claude Code and other CLI agents.

## 📖 quick start

- **open a project**: press \`⌘O\` to open your project's root directory (works like VS Code or Cursor)
- **create a new file**: press \`⌘N\` (or \`Ctrl+N\` on linux)
- **quick open**: press \`⌘P\` to search and open files

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

run \`claude\` from the integrated terminal - it should automatically connect to spacecake, giving Claude context about your open files.

if Claude shows "IDE disconnected", run \`/ide\` to check the connection status. you should see spacecake listed and can select it to reconnect.

a green **Claude Code** badge in the status bar indicates an active Claude session is connected.

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

## 💬 feedback & issues

have feedback, found a bug, or want to request a feature?

- click the **chat icon** in the bottom left corner to share your thoughts directly
- open an issue on [GitHub](https://github.com/spacecake-labs/spacecake/issues)

happy writing!
`
