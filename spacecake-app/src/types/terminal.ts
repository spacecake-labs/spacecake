import { Data } from "effect"

export class TerminalError extends Data.TaggedError("TerminalError")<{
  message: string
}> {}
