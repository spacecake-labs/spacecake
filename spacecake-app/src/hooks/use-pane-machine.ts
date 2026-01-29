import { useMemo } from "react"
import { PanePrimaryKey } from "@/schema/pane"

import { AbsolutePath } from "@/types/workspace"
import {
  createPaneMachineInput,
  getOrCreatePaneMachine,
} from "@/lib/atoms/pane"

/**
 * Hook that provides access to the pane machine.
 * The machine serializes pane operations to prevent race conditions.
 * Navigation should be handled by the caller based on machine state.
 */
export function usePaneMachine(
  paneId: PanePrimaryKey,
  workspacePath: AbsolutePath,
  workspaceId: string
) {
  const input = createPaneMachineInput(paneId, workspacePath, workspaceId)
  const machine = useMemo(
    () => getOrCreatePaneMachine(input),
    [paneId, workspacePath, workspaceId]
  )

  return machine
}
