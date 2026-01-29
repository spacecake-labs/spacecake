import { paneMachine, type PaneMachineInput } from "@/machines/pane"
import { PanePrimaryKey } from "@/schema/pane"
import { createActor, type Actor } from "xstate"

import { AbsolutePath } from "@/types/workspace"

/**
 * Type for the pane machine actor
 */
export type PaneMachineActor = Actor<typeof paneMachine>

// Cache for pane machine actors - keyed by paneId
const paneMachineCache = new Map<string, PaneMachineActor>()

/**
 * Get or create a pane machine actor for a given pane.
 * The machine serializes all pane operations (close, activate, open)
 * to prevent race conditions.
 */
export function getOrCreatePaneMachine(
  input: PaneMachineInput
): PaneMachineActor {
  const existingActor = paneMachineCache.get(input.paneId)
  if (existingActor) {
    return existingActor
  }

  const actor = createActor(paneMachine, { input })
  actor.start()
  paneMachineCache.set(input.paneId, actor)
  return actor
}

/**
 * Helper to create the machine input from pane context
 */
export const createPaneMachineInput = (
  paneId: PanePrimaryKey,
  workspacePath: AbsolutePath,
  workspaceId: string
): PaneMachineInput => ({
  paneId,
  workspacePath,
  workspaceId,
})
