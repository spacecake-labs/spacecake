import { useParams, useSearch } from "@tanstack/react-router"
import { Schema } from "effect"

import {
  EditorContext,
  RouteParamsSchema,
  SearchParamsSchema,
} from "@/types/workspace"
import { decodeBase64Url } from "@/lib/utils"
import { determineView } from "@/lib/view-preferences"

/**
 * Hook to get the current editor context from the router.
 * Returns null if not on a file route or if the context is invalid.
 */
export function useEditorContext(): EditorContext | null {
  const params = useParams({ strict: false })
  const search = useSearch({ strict: false })

  try {
    // Validate and decode route params using Effect schema
    const paramsResult = Schema.decodeUnknownSync(RouteParamsSchema)(params)
    const searchResult = Schema.decodeUnknownSync(SearchParamsSchema)(search)

    // Check if we're on a file route with valid params
    if (paramsResult.workspaceId && paramsResult.filePath) {
      const filePath = decodeBase64Url(paramsResult.filePath)
      const workspacePath = decodeBase64Url(paramsResult.workspaceId)

      // Use centralized view determination logic
      const viewKind = determineView(filePath, searchResult.view)

      // Create editor context
      const context: EditorContext = {
        workspacePath,
        filePath,
        viewKind,
      }

      return context
    }
  } catch {
    // Invalid params or encoding
  }

  return null
}
