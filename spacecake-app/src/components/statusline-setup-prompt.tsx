import { useCallback, useEffect, useRef } from "react"
import { claudeServerReadyAtom } from "@/providers/claude-integration-provider"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { Settings2, X } from "lucide-react"

import { match } from "@/types/adt"
import type { StatuslineConfigStatus } from "@/types/electron"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

// Persisted atom for dismissed state
const statuslinePromptDismissedAtom = atomWithStorage(
  "spacecake:statusline-prompt-dismissed",
  false
)

// Atom for statusline configuration status (fetched once when server ready)
const statuslineConfigAtom = atom<StatuslineConfigStatus | null>(null)

// Transient UI state for update operation
const isUpdatingAtom = atom(false)
const updateErrorAtom = atom<string | null>(null)

// Derived atom: should show prompt?
const shouldShowPromptAtom = atom((get) => {
  if (!get(claudeServerReadyAtom)) return false
  if (get(statuslinePromptDismissedAtom)) return false
  const config = get(statuslineConfigAtom)
  if (!config) return false
  return !config.isSpacecake
})

/**
 * Inner component that renders the actual prompt content.
 * Only mounted when shouldShow is true.
 */
function StatuslinePromptContent() {
  const config = useAtomValue(statuslineConfigAtom)
  const [isUpdating, setIsUpdating] = useAtom(isUpdatingAtom)
  const [error, setError] = useAtom(updateErrorAtom)
  const setConfig = useSetAtom(statuslineConfigAtom)
  const setDismissed = useSetAtom(statuslinePromptDismissedAtom)

  const handleSetup = useCallback(() => {
    setIsUpdating(true)
    setError(null)

    window.electronAPI.claude.statusline.update().then((result) => {
      match(result, {
        onLeft: (err) => {
          setError(err.description)
          setIsUpdating(false)
        },
        onRight: () => {
          setConfig({ configured: true, isSpacecake: true })
          setIsUpdating(false)
        },
      })
    })
  }, [setConfig, setError, setIsUpdating])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [setDismissed])

  return (
    <Alert className="mb-4 relative">
      <Settings2 className="h-4 w-4" />
      <AlertTitle className="pr-8">enable statusline integration</AlertTitle>
      <AlertDescription>
        <p className="mb-3">
          {config?.configured
            ? "Claude's statusline is configured but not pointing to Spacecake."
            : "enable real-time status updates from Claude Code."}
        </p>
        {error && <p className="text-destructive text-sm mb-2">{error}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSetup}
            disabled={isUpdating}
            className="cursor-pointer"
          >
            {isUpdating ? "setting up..." : "enable statusline"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            disabled={isUpdating}
            className="cursor-pointer"
          >
            not now
          </Button>
        </div>
      </AlertDescription>
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label="dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </Alert>
  )
}

/**
 * Prompt that appears when Claude connects without statusline configured for Spacecake.
 * Minimal subscriptions - only checks if it should render.
 */
export function StatuslineSetupPrompt() {
  const serverReady = useAtomValue(claudeServerReadyAtom)
  const shouldShow = useAtomValue(shouldShowPromptAtom)
  const setConfig = useSetAtom(statuslineConfigAtom)

  const hasFetchedRef = useRef(false)

  // Fetch config once when server becomes ready
  useEffect(() => {
    if (!serverReady || hasFetchedRef.current) return
    hasFetchedRef.current = true

    window.electronAPI.claude.statusline.read().then((result) => {
      match(result, {
        onLeft: (err) =>
          console.error("failed to read statusline config:", err),
        onRight: setConfig,
      })
    })
  }, [serverReady, setConfig])

  if (!shouldShow) return null

  return <StatuslinePromptContent />
}

/**
 * Reset the dismissed state for the statusline prompt.
 * Can be called from settings to show the prompt again.
 */
export function resetStatuslinePromptDismissed() {
  localStorage.removeItem("spacecake:statusline-prompt-dismissed")
}
