import { $isLinkNode } from "@lexical/link"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $findMatchingParent, $getNearestNodeFromDOMNode, $isElementNode } from "lexical"
import type { JSX } from "react"
import { useCallback, useEffect } from "react"

import { useEditor } from "@/contexts/editor-context"
import { usePaneMachine } from "@/hooks/use-pane-machine"
import { useRoute } from "@/hooks/use-route"
import { isInternalLink, resolveMarkdownLinkHref } from "@/lib/resolve-markdown-link"
import {
  findBlockElement,
  findHeadingElement,
  flashElement,
  scrollToHeading,
} from "@/lib/scroll-to-anchor"
import { encodeBase64Url } from "@/lib/utils"
import { Route } from "@/routes/w.$workspaceId"
import { AbsolutePath } from "@/types/workspace"

/**
 * intercepts clicks on markdown links (`[text](path)`) that point to
 * workspace-internal files and navigates via the pane machine instead
 * of opening them in the browser.
 *
 * registers capture-phase handlers so it fires before lexical's
 * ClickableLinkPlugin (which uses bubble phase).
 */
export function InternalLinkPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const route = useRoute()

  // these hooks require the workspace route context.
  // if route is null we're not on a file route — plugin is a no-op.
  if (route === null) return null

  return <InternalLinkHandler editor={editor} />
}

/**
 * inner component that safely uses route context hooks.
 * separated so the conditional return above doesn't violate rules of hooks.
 */
function InternalLinkHandler({
  editor,
}: {
  editor: ReturnType<typeof useLexicalComposerContext>[0]
}): null {
  const { workspace, paneId } = Route.useRouteContext()
  const workspaceIdEncoded = encodeBase64Url(workspace.path)
  const machine = usePaneMachine(paneId, workspace.path, workspaceIdEncoded)
  const { editorRef } = useEditor()
  const route = useRoute()

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!route?.filePath) return

      // find the nearest <a> element from the click target
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const anchor = target.closest("a")
      if (!anchor) return

      // read the raw URL from the lexical LinkNode (not the DOM href,
      // which may have been mangled by lexical's formatUrl).
      let rawUrl: string | null = null
      editor.read(() => {
        const clickedNode = $getNearestNodeFromDOMNode(target)
        if (clickedNode !== null) {
          const maybeLinkNode = $findMatchingParent(clickedNode, $isElementNode)
          if ($isLinkNode(maybeLinkNode)) {
            rawUrl = maybeLinkNode.getURL()
          }
        }
      })

      if (rawUrl === null || !isInternalLink(rawUrl)) return

      // this is an internal link — prevent ClickableLinkPlugin from handling it
      event.preventDefault()
      event.stopImmediatePropagation()

      const { filePath, anchor: linkAnchor } = resolveMarkdownLinkHref(
        route.filePath,
        workspace.path,
        rawUrl,
      )

      // same-file anchor: scroll and flash
      if (filePath === route.filePath && linkAnchor) {
        const ed = editorRef.current
        if (ed) {
          const isBlock = linkAnchor.startsWith("^")
          const el = isBlock
            ? findBlockElement(ed, linkAnchor.slice(1))
            : findHeadingElement(ed, linkAnchor)
          if (el) {
            scrollToHeading(el)
            flashElement(el)
          }
        }
        return
      }

      // cross-file navigation
      machine.send({
        type: "pane.file.open",
        filePath: AbsolutePath(filePath),
        navigationAnchor: linkAnchor,
      })
    },
    [editor, route?.filePath, workspace.path, machine, editorRef],
  )

  useEffect(() => {
    return editor.registerRootListener((rootElement) => {
      if (rootElement) {
        const onMouseUp = (event: MouseEvent) => {
          if (event.button === 1) {
            handleClick(event)
          }
        }

        rootElement.addEventListener("click", handleClick, { capture: true })
        rootElement.addEventListener("mouseup", onMouseUp, { capture: true })

        return () => {
          rootElement.removeEventListener("click", handleClick, { capture: true })
          rootElement.removeEventListener("mouseup", onMouseUp, { capture: true })
        }
      }
    })
  }, [editor, handleClick])

  return null
}
