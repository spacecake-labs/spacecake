import type { JSX } from "react"
import type { BaseSelection, LexicalEditor, NodeKey } from "lexical"

import type { Position } from "@/components/editor/nodes/inline-image-node"

import "@/components/editor/inline-image-node.css"

import * as React from "react"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { LexicalNestedComposer } from "@lexical/react/LexicalNestedComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { useLexicalEditable } from "@lexical/react/useLexicalEditable"
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DRAGSTART_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InlineImageNode } from "@/components/editor/nodes/inline-image-node"

import { ContentEditable } from "./content-editable"

const imageCache = new Set()

function useSuspenseImage(src: string) {
  if (!imageCache.has(src)) {
    throw new Promise((resolve) => {
      const img = new Image()
      img.src = src
      img.onload = () => {
        imageCache.add(src)
        resolve(null)
      }
    })
  }
}

function LazyImage({
  altText,
  className,
  imageRef,
  src,
  width,
  height,
  position,
}: {
  altText: string
  className: string | null
  height: "inherit" | number
  imageRef: { current: null | HTMLImageElement }
  src: string
  width: "inherit" | number
  position: Position
}): JSX.Element {
  useSuspenseImage(src)
  return (
    <img
      className={className || undefined}
      src={src}
      alt={altText}
      ref={imageRef}
      data-position={position}
      style={{
        display: "block",
        height,
        width,
      }}
      draggable="false"
    />
  )
}

export function UpdateInlineImageDialog({
  activeEditor,
  nodeKey,
  onClose,
}: {
  activeEditor: LexicalEditor
  nodeKey: NodeKey
  onClose: () => void
}): JSX.Element {
  const editorState = activeEditor.getEditorState()
  const node = editorState.read(() => $getNodeByKey(nodeKey) as InlineImageNode)
  const [altText, setAltText] = useState(node.getAltText())
  const [showCaption, setShowCaption] = useState(node.getShowCaption())
  const [position, setPosition] = useState<Position>(node.getPosition())

  const handleShowCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowCaption(e.target.checked)
  }

  const handlePositionChange = (value: string) => {
    setPosition(value as Position)
  }

  const handleOnConfirm = () => {
    const payload = { altText, position, showCaption }
    if (node) {
      activeEditor.update(() => {
        node.update(payload)
      })
    }
    onClose()
  }

  return (
    <>
      <div style={{ marginBottom: "1em" }}>
        <label>Alt Text</label>
        <Input
          placeholder="Descriptive alternative text"
          onChange={(e) => setAltText(e.target.value)}
          value={altText}
          data-test-id="image-modal-alt-text-input"
        />
      </div>

      <Select onValueChange={handlePositionChange} value={position}>
        <SelectTrigger style={{ marginBottom: "1em", width: "208px" }}>
          <SelectValue placeholder="Position" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="left">Left</SelectItem>
          <SelectItem value="right">Right</SelectItem>
          <SelectItem value="full">Full Width</SelectItem>
        </SelectContent>
      </Select>

      <div className="Input__wrapper">
        <input
          id="caption"
          type="checkbox"
          checked={showCaption}
          onChange={handleShowCaptionChange}
        />
        <label htmlFor="caption">Show Caption</label>
      </div>

      <DialogFooter>
        <Button
          data-test-id="image-modal-file-upload-btn"
          onClick={() => handleOnConfirm()}
        >
          Confirm
        </Button>
      </DialogFooter>
    </>
  )
}

export default function InlineImageComponent({
  src,
  altText,
  nodeKey,
  width,
  height,
  showCaption,
  caption,
  position,
}: {
  altText: string
  caption: LexicalEditor
  height: "inherit" | number
  nodeKey: NodeKey
  showCaption: boolean
  src: string
  width: "inherit" | number
  position: Position
}): JSX.Element {
  const imageRef = useRef<null | HTMLImageElement>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const [editor] = useLexicalComposerContext()
  const [selection, setSelection] = useState<BaseSelection | null>(null)
  const activeEditorRef = useRef<LexicalEditor | null>(null)
  const isEditable = useLexicalEditable()
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const $onEnter = useCallback(
    (event: KeyboardEvent) => {
      const latestSelection = $getSelection()
      const buttonElem = buttonRef.current
      if (
        isSelected &&
        $isNodeSelection(latestSelection) &&
        latestSelection.getNodes().length === 1
      ) {
        if (showCaption) {
          // Move focus into nested editor
          $setSelection(null)
          event.preventDefault()
          caption.focus()
          return true
        } else if (
          buttonElem !== null &&
          buttonElem !== document.activeElement
        ) {
          event.preventDefault()
          buttonElem.focus()
          return true
        }
      }
      return false
    },
    [caption, isSelected, showCaption]
  )

  const $onEscape = useCallback(
    (event: KeyboardEvent) => {
      if (
        activeEditorRef.current === caption ||
        buttonRef.current === event.target
      ) {
        $setSelection(null)
        editor.update(() => {
          setSelected(true)
          const parentRootElement = editor.getRootElement()
          if (parentRootElement !== null) {
            parentRootElement.focus()
          }
        })
        return true
      }
      return false
    },
    [caption, editor, setSelected]
  )

  useEffect(() => {
    let isMounted = true
    const unregister = mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        if (isMounted) {
          setSelection(editorState.read(() => $getSelection()))
        }
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_, activeEditor) => {
          activeEditorRef.current = activeEditor
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (payload) => {
          const event = payload
          if (event.target === imageRef.current) {
            if (event.shiftKey) {
              setSelected(!isSelected)
            } else {
              clearSelection()
              setSelected(true)
            }
            return true
          }

          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        DRAGSTART_COMMAND,
        (event) => {
          if (event.target === imageRef.current) {
            // TODO This is just a temporary workaround for FF to behave like other browsers.
            // Ideally, this handles drag & drop too (and all browsers).
            event.preventDefault()
            return true
          }
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(KEY_ENTER_COMMAND, $onEnter, COMMAND_PRIORITY_LOW),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        $onEscape,
        COMMAND_PRIORITY_LOW
      )
    )
    return () => {
      isMounted = false
      unregister()
    }
  }, [
    clearSelection,
    editor,
    isSelected,
    nodeKey,
    $onEnter,
    $onEscape,
    setSelected,
  ])

  const draggable = isSelected && $isNodeSelection(selection)
  const isFocused = isSelected && isEditable
  return (
    <Suspense fallback={null}>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <span draggable={draggable}>
          {isEditable && (
            <DialogTrigger asChild>
              <button className="image-edit-button" ref={buttonRef}>
                Edit
              </button>
            </DialogTrigger>
          )}
          <LazyImage
            className={
              isFocused
                ? `focused ${$isNodeSelection(selection) ? "draggable" : ""}`
                : null
            }
            src={src}
            altText={altText}
            imageRef={imageRef}
            width={width}
            height={height}
            position={position}
          />
        </span>
        {showCaption && (
          <span className="image-caption-container">
            <LexicalNestedComposer initialEditor={caption}>
              <AutoFocusPlugin />
              <ClickableLinkPlugin />
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    placeholder="Enter a caption..."
                    placeholderClassName="InlineImageNode__placeholder"
                    className="InlineImageNode__contentEditable"
                  />
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
            </LexicalNestedComposer>
          </span>
        )}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Inline Image</DialogTitle>
          </DialogHeader>
          <UpdateInlineImageDialog
            activeEditor={editor}
            nodeKey={nodeKey}
            onClose={() => setIsDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Suspense>
  )
}
