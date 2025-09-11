import { useParams } from "@tanstack/react-router"

import { decodeBase64Url } from "@/lib/utils"

/**
 * Hook to get the current filepath from the router.
 * Returns null if not on a file route or if the filepath is invalid.
 */
export function useFilepath(): string | null {
  const params = useParams({ strict: false })

  // Check if we're on a file route
  if (params.filePath && params.workspaceId) {
    try {
      const filePath = decodeBase64Url(params.filePath as string)
      const workspacePath = decodeBase64Url(params.workspaceId as string)

      // Validate that file belongs to workspace
      if (filePath.startsWith(workspacePath)) {
        return filePath
      }
    } catch {
      // Invalid encoding
    }
  }

  return null
}
