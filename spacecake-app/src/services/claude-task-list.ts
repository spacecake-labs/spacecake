import fs from "node:fs"
import path from "node:path"

import { ClaudeConfig } from "@/services/claude-config"
import * as ParcelWatcher from "@parcel/watcher"
import { Effect, Option, Schema } from "effect"
import { BrowserWindow } from "electron"

import {
  ClaudeTaskError,
  ClaudeTaskSchema,
  type ClaudeTask,
} from "@/types/claude-task"

export class ClaudeTaskListService extends Effect.Service<ClaudeTaskListService>()(
  "ClaudeTaskListService",
  {
    scoped: Effect.gen(function* () {
      const config = yield* ClaudeConfig

      let subscription: ParcelWatcher.AsyncSubscription | null = null
      let currentListId: string | null = null

      /**
       * Resolve the effective list ID: config env var takes priority, else sessionId fallback
       */
      const resolveListId = (sessionId?: string): string | null => {
        if (Option.isSome(config.taskListId)) {
          return Option.getOrThrow(config.taskListId)
        }
        return sessionId ?? null
      }

      /**
       * Get the tasks directory for a given list ID
       */
      const getTasksPath = (listId: string): string =>
        path.join(config.tasksDir, listId)

      /**
       * Read a single task file and parse it
       */
      const readTaskFile = (filePath: string): ClaudeTask | null => {
        try {
          const content = fs.readFileSync(filePath, "utf-8")
          const json = JSON.parse(content)
          const decoded = Schema.decodeUnknownSync(ClaudeTaskSchema)(json)
          return decoded
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
       * Notify all renderer windows that the task list has changed
       */
      const notifyChanged = (): void => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send("claude:tasks:changed")
        }
      }

      /**
       * Start watching a task list directory for changes.
       * Notifies renderers on any .json file change so they can re-fetch.
       */
      const startWatching = async (sessionId?: string): Promise<void> => {
        const listId = resolveListId(sessionId)
        if (!listId) {
          throw new ClaudeTaskError("No task list ID available")
        }

        // Stop existing watcher if watching a different list
        if (subscription && currentListId !== listId) {
          await stopWatching()
        }

        if (subscription) return

        currentListId = listId
        const tasksPath = getTasksPath(listId)

        // Ensure directory exists before watching
        fs.mkdirSync(tasksPath, { recursive: true })

        subscription = await ParcelWatcher.subscribe(
          tasksPath,
          (_err, events) => {
            const hasJsonChanges = events.some((e) => e.path.endsWith(".json"))
            if (!hasJsonChanges) return
            notifyChanged()
          }
        )
      }

      /**
       * Stop the current file watcher
       */
      const stopWatching = async (): Promise<void> => {
        if (subscription) {
          await subscription.unsubscribe()
          subscription = null
          currentListId = null
        }
      }

      /**
       * List tasks for a given session (resolves list ID)
       */
      const listTasks = (sessionId?: string): ClaudeTask[] => {
        const listId = resolveListId(sessionId)
        if (!listId) return []
        return readAllTasks(listId)
      }

      // Cleanup on service disposal
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          await stopWatching()
        })
      )

      return {
        resolveListId,
        readAllTasks,
        startWatching,
        stopWatching,
        listTasks,
      }
    }),
    dependencies: [ClaudeConfig.Default],
  }
) {}
