import * as Data from "effect/Data"
export class TerminalError extends Data.TaggedError("TerminalError")<{
  message: string
}> {}
