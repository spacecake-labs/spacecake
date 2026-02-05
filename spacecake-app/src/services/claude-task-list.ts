import { Effect, Option, Schema } from "effect"
import fs from "node:fs"
import path from "node:path"

import { ClaudeConfig } from "@/services/claude-config"
import { FileSystem } from "@/services/file-system"
import { ClaudeTaskError, ClaudeTaskSchema, type ClaudeTask } from "@/types/claude-task"
import { AbsolutePath } from "@/types/workspace"

export class ClaudeTaskListService extends Effect.Service<ClaudeTaskListService>()(
  "ClaudeTaskListService",
  {
    scoped: Effect.gen(function* () {
      const config = yield* ClaudeConfig
      const fileSystem = yield* FileSystem

      let currentListId: string | null = null
      let currentWatchPath: AbsolutePath | null = null

      /**
       * Resolve the effective list ID: config env var takes priority, else sessionId fallback
       */
      const resolveListId = (sessionId?: string): string | null =>
        Option.getOrElse(config.taskListId, () => sessionId ?? null)

      /**
       * Get the tasks directory for a given list ID
       */
      const getTasksPath = (listId: string): string => path.join(config.tasksDir, listId)

      const decodeTask = Schema.decodeUnknownOption(ClaudeTaskSchema)

      /**
       * Read a single task file and parse it
       */
      const readTaskFile = (filePath: string): ClaudeTask | null => {
        try {
          const content = fs.readFileSync(filePath, "utf-8")
          const json = JSON.parse(content)
          return Option.getOrNull(decodeTask(json))
        } catch {
          return null
        }
      }

      /**
       * Read all tasks from a list directory
       */
      const readAllTasks = (listId: string): ClaudeTask[] => {
        const tasksPath = getTasksPath(listId)
        if (!fs.existsSync(tasksPath)) {
          return []
        }
        try {
          const files = fs.readdirSync(tasksPath)
          const tasks: ClaudeTask[] = []
          for (const file of files) {
            if (!file.endsWith(".json")) continue
            const task = readTaskFile(path.join(tasksPath, file))
            if (task) tasks.push(task)
          }
          return tasks
        } catch {
          return []
        }
      }

      /**
       * Start watching a task list directory for changes.
       * Notifies renderers on any .json file change so they can re-fetch.
       */
      const startWatching = (sessionId?: string): Effect.Effect<void, ClaudeTaskError> =>
        Effect.gen(function* () {
          const listId = resolveListId(sessionId)
          if (!listId) {
            return yield* Effect.fail(
              new ClaudeTaskError({ description: "No task list ID available" }),
            )
          }

          // Stop existing watcher if watching a different list
          if (currentWatchPath && currentListId !== listId) {
            yield* stopWatching()
          }

          if (currentWatchPath) return

          currentListId = listId
          const tasksPath = AbsolutePath(getTasksPath(listId))

          // Ensure directory exists before watching
          yield* fileSystem.createFolder(tasksPath, { recursive: true }).pipe(
            Effect.catchAll(() => Effect.void), // Ignore if already exists
          )

          // Start watching with JSON file filter
          yield* fileSystem
            .startDirWatcher(tasksPath, "claude:tasks:changed", (p) => p.endsWith(".json"))
            .pipe(
              Effect.mapError(
                (e) =>
                  new ClaudeTaskError({ description: `Failed to start watcher: ${e.description}` }),
              ),
            )

          currentWatchPath = tasksPath
        })

      /**
       * Stop the current file watcher
       */
      const stopWatching = (): Effect.Effect<void, ClaudeTaskError> =>
        Effect.gen(function* () {
          if (currentWatchPath) {
            yield* fileSystem.stopDirWatcher(currentWatchPath).pipe(
              Effect.mapError(
                (e) =>
                  new ClaudeTaskError({
                    description: `Failed to stop watcher: ${e.description}`,
                  }),
              ),
            )
            currentWatchPath = null
            currentListId = null
          }
        })

      /**
       * List tasks for a given session (resolves list ID)
       */
      const listTasks = (sessionId?: string): ClaudeTask[] => {
        const listId = resolveListId(sessionId)
        if (!listId) return []
        return readAllTasks(listId)
      }

      // Cleanup on service disposal
      yield* Effect.addFinalizer(() => stopWatching().pipe(Effect.catchAll(() => Effect.void)))

      return {
        resolveListId,
        readAllTasks,
        startWatching,
        stopWatching,
        listTasks,
      }
    }),
    dependencies: [ClaudeConfig.Default, FileSystem.Default],
  },
) {}
