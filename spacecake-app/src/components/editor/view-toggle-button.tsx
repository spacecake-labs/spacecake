import { Link } from "@tanstack/react-router"
import { Code, Eye, Loader2 } from "lucide-react"

import { RouteContext, RouteContextHelpers } from "@/types/workspace"
import { supportedViews } from "@/lib/language-support"
import { encodeBase64Url } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface ViewToggleButtonProps {
  routeContext: RouteContext
}

export function ViewToggleButton({ routeContext }: ViewToggleButtonProps) {
  const { filePath, viewKind, fileType } = routeContext
  const workspaceId = RouteContextHelpers.workspaceId(routeContext)
  const canToggleViews = supportedViews(fileType).size > 1

  if (!canToggleViews) {
    return null
  }

  // show spinner if viewKind is loading (undefined)
  if (viewKind === undefined) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="h-7 px-2 text-xs"
        aria-label="loading view"
      >
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        view
      </Button>
    )
  }

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs cursor-pointer"
      aria-label={
        viewKind === "rich" ? "switch to source view" : "switch to rich view"
      }
      title={
        viewKind === "rich" ? "switch to source view" : "switch to rich view"
      }
    >
      <Link
        to="/w/$workspaceId/f/$filePath"
        params={{
          workspaceId,
          filePath: encodeBase64Url(filePath),
        }}
        search={{ view: viewKind === "rich" ? "source" : "rich" }}
      >
        {viewKind === "rich" ? (
          <>
            <Eye className="h-3 w-3 mr-1" />
            rich
          </>
        ) : (
          <>
            <Code className="h-3 w-3 mr-1" />
            source
          </>
        )}
      </Link>
    </Button>
  )
}
