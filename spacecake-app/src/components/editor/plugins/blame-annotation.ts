import { Facet, type Extension } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  type PluginValue,
  type Tooltip,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"

import type { BlameLine } from "@/services/git-blame-parser"
import { isUncommitted } from "@/services/git-blame-parser"

// -- time formatting --

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export const formatTimeAgo = (date: Date, now = Date.now()): string => {
  const diff = now - date.getTime()
  if (diff < MINUTE) return "just now"
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE)
    return m === 1 ? "1 minute ago" : `${m} minutes ago`
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR)
    return h === 1 ? "1 hour ago" : `${h} hours ago`
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY)
    return d === 1 ? "1 day ago" : `${d} days ago`
  }
  if (diff < MONTH) {
    const w = Math.floor(diff / WEEK)
    return w === 1 ? "1 week ago" : `${w} weeks ago`
  }
  if (diff < YEAR) {
    const m = Math.floor(diff / MONTH)
    return m === 1 ? "1 month ago" : `${m} months ago`
  }
  const y = Math.floor(diff / YEAR)
  return y === 1 ? "1 year ago" : `${y} years ago`
}

export const formatBlameText = (blame: BlameLine, now?: number): string => {
  const timeAgo = formatTimeAgo(blame.date, now)
  return `${blame.author}, ${timeAgo}`
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const formatDate = (date: Date): string => {
  const day = date.getDate()
  const month = MONTHS[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

// -- facet to pass blame data into the extension --

export const blameFacet = Facet.define<BlameLine[], BlameLine[]>({
  combine: (values) => values[0] ?? [],
})

// -- avatar helper --

const getAvatarUrl = (blame: BlameLine): string | null => {
  const email = blame.authorEmail
  if (!email) return null

  // strip surrounding angle brackets: <user@host> → user@host
  const clean = email.replace(/^<|>$/g, "")

  // github noreply format: <id+username@users.noreply.github.com>
  const ghMatch = clean.match(/^(\d+)\+.+@users\.noreply\.github\.com$/)
  if (ghMatch) {
    return `https://avatars.githubusercontent.com/u/${ghMatch[1]}?s=64`
  }

  return null
}

// -- branch icon svg --

const BRANCH_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>`

// -- copy icon svg --

const COPY_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>`

// -- check icon svg --

const CHECK_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`

// -- tooltip dom builder --

const COPIED_FEEDBACK_MS = 1500

const createTooltipDom = (blame: BlameLine): HTMLElement => {
  const tooltip = document.createElement("div")
  tooltip.className = "cm-blame-tooltip"

  const shortHash = blame.hash.slice(0, 8)
  const email = blame.authorEmail?.replace(/^<|>$/g, "") ?? ""

  // -- header row: avatar + author name --
  const headerRow = document.createElement("div")
  headerRow.className = "cm-blame-tooltip-header"

  const avatarUrl = getAvatarUrl(blame)
  if (avatarUrl) {
    const avatar = document.createElement("img")
    avatar.className = "cm-blame-tooltip-avatar"
    avatar.src = avatarUrl
    avatar.alt = blame.author
    avatar.width = 24
    avatar.height = 24
    headerRow.appendChild(avatar)
  }

  const authorName = document.createElement("span")
  authorName.className = "cm-blame-tooltip-author"
  authorName.textContent = blame.author
  headerRow.appendChild(authorName)

  tooltip.appendChild(headerRow)

  // -- email --
  if (email) {
    const emailDiv = document.createElement("div")
    emailDiv.className = "cm-blame-tooltip-email"
    emailDiv.textContent = `<${email}>`
    tooltip.appendChild(emailDiv)
  }

  // -- commit summary --
  const summaryDiv = document.createElement("div")
  summaryDiv.className = "cm-blame-tooltip-summary"
  summaryDiv.textContent = blame.summary
  tooltip.appendChild(summaryDiv)

  // -- footer row: date + hash with copy button --
  const footerRow = document.createElement("div")
  footerRow.className = "cm-blame-tooltip-footer"

  const dateSpan = document.createElement("span")
  dateSpan.className = "cm-blame-tooltip-date"
  dateSpan.textContent = formatDate(blame.date)
  footerRow.appendChild(dateSpan)

  const hashGroup = document.createElement("span")
  hashGroup.className = "cm-blame-tooltip-hash-group"

  const branchIcon = document.createElement("span")
  branchIcon.className = "cm-blame-tooltip-branch-icon"
  branchIcon.innerHTML = BRANCH_ICON_SVG
  hashGroup.appendChild(branchIcon)

  const hashSpan = document.createElement("span")
  hashSpan.className = "cm-blame-tooltip-hash"
  hashSpan.textContent = shortHash
  hashGroup.appendChild(hashSpan)

  const copyBtn = document.createElement("button")
  copyBtn.className = "cm-blame-tooltip-copy"
  copyBtn.innerHTML = COPY_ICON_SVG
  copyBtn.title = "copy full commit hash"
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(blame.hash)
    copyBtn.innerHTML = CHECK_ICON_SVG
    setTimeout(() => {
      copyBtn.innerHTML = COPY_ICON_SVG
    }, COPIED_FEEDBACK_MS)
  })
  hashGroup.appendChild(copyBtn)

  footerRow.appendChild(hashGroup)
  tooltip.appendChild(footerRow)

  return tooltip
}

// -- hover tooltip extension using codemirror's native hover tooltip api --

const blameHoverTooltip = hoverTooltip(
  (view, pos, side) => {
    const blameData = view.state.facet(blameFacet)
    if (!blameData.length) return null

    // only show tooltip when hovering past end of line (over the widget area)
    const line = view.state.doc.lineAt(pos)
    if (pos < line.to || (pos === line.to && side < 0)) return null

    // only show for the line the cursor is on (where the widget is rendered)
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
    if (line.number !== cursorLine) return null

    const blameLine = blameData[line.number - 1]
    if (!blameLine || blameLine.line !== line.number || isUncommitted(blameLine.hash)) {
      return null
    }

    return {
      pos: line.to,
      above: true,
      create: () => ({
        dom: createTooltipDom(blameLine),
      }),
    } satisfies Tooltip
  },
  { hoverTime: 200 },
)

// -- widget --

class BlameWidget extends WidgetType {
  constructor(
    readonly blame: BlameLine,
    readonly text: string,
  ) {
    super()
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span")
    span.className = "cm-blame-annotation"

    const icon = document.createElement("span")
    icon.className = "cm-blame-icon"
    icon.innerHTML = BRANCH_ICON_SVG
    span.appendChild(icon)

    const textNode = document.createElement("span")
    textNode.textContent = this.text
    span.appendChild(textNode)

    return span
  }

  eq(other: BlameWidget): boolean {
    return this.blame.hash === other.blame.hash && this.text === other.text
  }
}

// -- view plugin --

class BlameAnnotationPlugin implements PluginValue {
  decorations: DecorationSet
  private lastLine = -1
  private focused: boolean

  constructor(view: EditorView) {
    this.focused = view.hasFocus
    this.decorations = this.buildDecorations(view)
  }

  update(update: ViewUpdate) {
    const focusChanged = update.view.hasFocus !== this.focused
    this.focused = update.view.hasFocus

    const currentLine = update.state.doc.lineAt(update.state.selection.main.head).number
    if (
      focusChanged ||
      update.selectionSet ||
      update.docChanged ||
      currentLine !== this.lastLine ||
      // rebuild if blame data changed via facet
      update.startState.facet(blameFacet) !== update.state.facet(blameFacet)
    ) {
      this.decorations = this.buildDecorations(update.view)
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const blameData = view.state.facet(blameFacet)
    if (!blameData.length || !view.hasFocus) return Decoration.none

    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
    this.lastLine = cursorLine

    // O(1) lookup — blame data is ordered by line number, 1-indexed
    const blameLine = blameData[cursorLine - 1]
    if (!blameLine || blameLine.line !== cursorLine || isUncommitted(blameLine.hash)) {
      return Decoration.none
    }

    const text = formatBlameText(blameLine)
    const line = view.state.doc.line(cursorLine)

    const widget = Decoration.widget({
      widget: new BlameWidget(blameLine, text),
      side: 1,
    })

    return Decoration.set([widget.range(line.to)])
  }
}

const blamePlugin = ViewPlugin.fromClass(BlameAnnotationPlugin, {
  decorations: (v) => v.decorations,
})

// -- public api --

export const blameAnnotation = (blameData: BlameLine[]): Extension => [
  blameFacet.of(blameData),
  blamePlugin,
  blameHoverTooltip,
]

export const emptyBlameAnnotation = (): Extension => [blameFacet.of([]), blamePlugin]
