import { useMemo } from "react"
import { PanePrimaryKey } from "@/schema/pane"

import { AbsolutePath } from "@/types/workspace"
import {
  createPaneMachineInput,
  getOrCreatePaneMachine,
} from "@/lib/atoms/pane"

/**
 * Hook that provides access to the pane machine.
 * The machine serializes pane operations (open, close, activate)
 * ensuring operations complete in order.
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
