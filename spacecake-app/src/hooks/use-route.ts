import { useParams, useSearch } from "@tanstack/react-router"
import { Schema } from "effect"

import {
  AbsolutePath,
  RouteContext,
  RouteParamsSchema,
} from "@/types/workspace"
import { decodeBase64Url } from "@/lib/utils"
import { fileTypeFromExtension } from "@/lib/workspace"

/**
 * Hook to get the current editor context from the router.
 * Returns null if not on a file route, if the context is invalid, or while loading.
 */
export function useRoute(): RouteContext | null {
  const params = useParams({ strict: false })
  const view = useSearch({
    strict: false,
    select: ({ view }) => view,
  })

  try {
    const paramsResult = Schema.decodeUnknownSync(RouteParamsSchema)(params)

    if (paramsResult.workspaceId && paramsResult.filePath) {
      const filePath = AbsolutePath(decodeBase64Url(paramsResult.filePath))

      const context: RouteContext = {
        workspaceId: decodeBase64Url(paramsResult.workspaceId),
        filePath,
        viewKind: view,
        fileType: fileTypeFromExtension(filePath.split(".").pop() ?? ""),
      }
      return context
    }
  } catch {
    // Invalid params or encoding
  }

  return null
}
