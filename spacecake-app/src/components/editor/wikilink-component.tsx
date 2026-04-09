import { useAtomValue, useStore } from "jotai"
import { selectAtom } from "jotai/utils"
import type { NodeKey } from "lexical"
import { Component, useEffect, useMemo, type ErrorInfo, type ReactNode } from "react"
import { toast } from "sonner"

import { useEditor } from "@/contexts/editor-context"
import { usePaneMachine } from "@/hooks/use-pane-machine"
import { ensureFileIndex, quickOpenIndexMapAtom } from "@/lib/atoms/quick-open-index"
import {
  resolveWikiLinkIndexed,
  type BrokenWikiLink,
  type ResolvedWikiLink,
} from "@/lib/resolve-wikilink"
import {
  findBlockElement,
  findHeadingElement,
  flashElement,
  scrollToHeading,
} from "@/lib/scroll-to-anchor"
import { encodeBase64Url } from "@/lib/utils"
import { Route } from "@/routes/w.$workspaceId"
import { type Either, isRight } from "@/types/adt"

/** structural equality for wikilink resolution results so selectAtom skips re-renders */
function resolutionEqual(
  a: Either<BrokenWikiLink, ResolvedWikiLink>,
  b: Either<BrokenWikiLink, ResolvedWikiLink>,
): boolean {
  if (a._tag !== b._tag) return false
  if (a._tag === "Left" && b._tag === "Left") {
    return a.value.reason === b.value.reason && a.value.target === b.value.target
  }
  if (a._tag === "Right" && b._tag === "Right") {
    return (
      a.value.filePath === b.value.filePath &&
      a.value.anchor?.kind === b.value.anchor?.kind &&
      a.value.anchor?.value === b.value.anchor?.value
    )
  }
  return false
}

interface WikiLinkComponentProps {
  target: string
  alias: string | null
  nodeKey: NodeKey
}

/**
 * inner component that requires router context for click-to-navigate.
 */
function WikiLinkInner({ target, alias }: { target: string; alias: string | null }) {
  const { workspace, paneId } = Route.useRouteContext()
  const workspaceIdEncoded = encodeBase64Url(workspace.path)
  const machine = usePaneMachine(paneId, workspace.path, workspaceIdEncoded)
  const { editorRef } = useEditor()
  const jotaiStore = useStore()
  // ensure the file index is built when wikilinks are present.
  // the loading atom prevents duplicate IPC calls when many wikilinks mount at once.
  useEffect(() => {
    ensureFileIndex(jotaiStore, workspace.path)
  }, [workspace.path, jotaiStore])

  // each wikilink subscribes to a selectAtom scoped to its own target.
  // uses the pre-indexed map for O(1) resolution instead of filtering the full list.
  // re-renders only when this specific resolution changes, not on every file index update.
  const resolutionAtom = useMemo(
    () =>
      selectAtom(
        quickOpenIndexMapAtom,
        (index) => resolveWikiLinkIndexed(target, index),
        resolutionEqual,
      ),
    [target],
  )
  const resolution = useAtomValue(resolutionAtom)
  const isSelfLink = !isRight(resolution) && resolution.value.reason === "self-link"
  const resolved = isRight(resolution) || isSelfLink
  const displayText = alias ?? target

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // same-file anchor link: [[#heading]]
    const hashIndex = target.indexOf("#")
    const filenamePart = hashIndex === -1 ? target : target.slice(0, hashIndex)
    const anchorPart = hashIndex === -1 ? undefined : target.slice(hashIndex + 1)

    if (filenamePart === "" && anchorPart) {
      const editor = editorRef.current
      if (editor) {
        const isBlock = anchorPart.startsWith("^")
        const el = isBlock
          ? findBlockElement(editor, anchorPart.slice(1))
          : findHeadingElement(editor, anchorPart)
        if (el) {
          scrollToHeading(el)
          flashElement(el)
        }
      }
      return
    }

    if (isRight(resolution)) {
      const anchor = resolution.value.anchor
      machine.send({
        type: "pane.file.open",
        filePath: resolution.value.filePath,
        navigationAnchor: anchor
          ? anchor.kind === "block"
            ? `^${anchor.value}`
            : anchor.value
          : undefined,
      })
    } else {
      const reason = resolution.value.reason
      if (reason === "ambiguous") {
        toast.error(`ambiguous link: "${target}" matches multiple files`)
      } else if (reason === "not-found") {
        toast.error(`file not found: "${target}"`)
      }
    }
  }

  return (
    <span
      role="link"
      onClick={handleClick}
      title={
        isSelfLink
          ? target
          : isRight(resolution)
            ? resolution.value.filePath
            : `broken link: ${resolution.value.reason}`
      }
      className={
        resolved
          ? "cursor-pointer underline decoration-dotted underline-offset-4 decoration-muted-foreground/50 hover:decoration-foreground hover:bg-accent/50 rounded-sm px-0.5 transition-colors"
          : "cursor-pointer underline decoration-dotted underline-offset-4 decoration-destructive/50 text-muted-foreground opacity-70 rounded-sm px-0.5"
      }
    >
      {displayText}
    </span>
  )
}

/**
 * lightweight error boundary for the wikilink component.
 * catches router context errors when rendering outside a workspace route
 * (e.g. in unit tests or standalone previews).
 */
class WikiLinkBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // silently degrade — router context isn't available
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

export default function WikiLinkComponent({ target, alias }: WikiLinkComponentProps) {
  const displayText = alias ?? target

  const fallback = (
    <span className="underline decoration-dotted underline-offset-4 decoration-muted-foreground/50 px-0.5">
      {displayText}
    </span>
  )

  return (
    <WikiLinkBoundary fallback={fallback}>
      <WikiLinkInner target={target} alias={alias} />
    </WikiLinkBoundary>
  )
}
