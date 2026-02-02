import { Effect } from "effect"
import { createActor, fromPromise, setup, type Actor } from "xstate"

import type { WorkspaceSettings } from "@/schema/workspace-settings"

import { WorkspacePrimaryKey } from "@/schema/workspace"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"

/**
 * Settings machine that handles workspace settings updates.
 * Lives at module level to survive component unmounts.
 */
const settingsMachine = setup({
  types: {
    input: {} as { workspaceId: WorkspacePrimaryKey },
    context: {} as { workspaceId: WorkspacePrimaryKey },
    events: {} as {
      type: "settings.update"
      settings: WorkspaceSettings
    },
  },
  actors: {
    saveSettings: fromPromise(
      ({ input }: { input: { workspaceId: WorkspacePrimaryKey; settings: WorkspaceSettings } }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const db = yield* Database
            yield* db.updateWorkspaceSettings(input.workspaceId, input.settings)
          }).pipe(Effect.tapErrorCause(Effect.logError)),
        ),
    ),
  },
}).createMachine({
  id: "settings",
  context: ({ input }) => ({ workspaceId: input.workspaceId }),
  initial: "idle",
  states: {
    idle: {
      on: {
        "settings.update": { target: "saving" },
      },
    },
    saving: {
      invoke: {
        src: "saveSettings",
        input: ({ context, event }) => ({
          workspaceId: context.workspaceId,
          settings: event.settings,
        }),
        onDone: { target: "idle" },
        onError: { target: "idle" },
      },
      on: {
        // Queue next update if one comes in while saving
        "settings.update": { target: "saving", reenter: true },
      },
    },
  },
})

export type SettingsMachineActor = Actor<typeof settingsMachine>

// Cache for settings machine actors - keyed by workspaceId
const settingsMachineCache = new Map<WorkspacePrimaryKey, SettingsMachineActor>()

/**
 * Get or create a settings machine actor for a given workspace.
 * The machine lives at module level to ensure saves complete
 * even after component unmounts.
 */
export function getOrCreateSettingsMachine(workspaceId: WorkspacePrimaryKey): SettingsMachineActor {
  const existing = settingsMachineCache.get(workspaceId)
  if (existing) {
    return existing
  }

  const actor = createActor(settingsMachine, { input: { workspaceId } })
  actor.start()
  settingsMachineCache.set(workspaceId, actor)
  return actor
}
