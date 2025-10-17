/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLayoutEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { EditorState, LexicalEditor } from "lexical"
import { HISTORY_MERGE_TAG } from "lexical"

import { INITIAL_LOAD_TAG, type ChangeType } from "@/types/lexical"

// this is not yet exported by lexical
// https://github.com/facebook/lexical/blob/main/packages/lexical/src/LexicalUpdateTags.ts
const FOCUS_TAG = "focus"

export function OnChangePlugin({
  onChange,
}: {
  onChange: (
    editorState: EditorState,
    editor: LexicalEditor,
    tags: Set<string>,
    changeType: ChangeType
  ) => void
}): null {
  const [editor] = useLexicalComposerContext()

  useLayoutEffect(() => {
    if (onChange) {
      return editor.registerUpdateListener(
        ({
          editorState,
          dirtyElements,
          dirtyLeaves,
          prevEditorState,
          tags,
        }) => {
          if (
            tags.has(FOCUS_TAG) ||
            tags.has(HISTORY_MERGE_TAG) ||
            // custom tag added by file parser
            tags.has(INITIAL_LOAD_TAG) ||
            prevEditorState.isEmpty()
          ) {
            return
          }

          const isSelectionChange =
            dirtyElements.size === 0 && dirtyLeaves.size === 0

          const changeType: ChangeType = isSelectionChange
            ? "selection"
            : "content"

          onChange(editorState, editor, tags, changeType)
        }
      )
    }
  }, [editor, onChange])

  return null
}
