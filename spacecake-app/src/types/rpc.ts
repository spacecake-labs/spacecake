import { Schema } from "effect"

// JSON-RPC 2.0 message schemas
const JsonRpcRequestSchema = Schema.Struct({
  method: Schema.String,
  id: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
  params: Schema.optional(Schema.Unknown),
})

// Union allows for future extension with Response, Error, and other message types
// as per JSON-RPC 2.0 spec. Currently only Request is supported.
export const JsonRpcMessageSchema = Schema.Union(JsonRpcRequestSchema)

export type JsonRpcMessage = Schema.Schema.Type<typeof JsonRpcMessageSchema>

// MCP tool call params schema
export const ToolCallParamsSchema = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optional(Schema.Unknown),
})

export type ToolCallParams = Schema.Schema.Type<typeof ToolCallParamsSchema>

// JSON-RPC 2.0 Response schema
export const JsonRpcResponseSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union(Schema.Number, Schema.String, Schema.Null),
  result: Schema.optional(Schema.Any),
})

export type JsonRpcResponse = Schema.Schema.Type<typeof JsonRpcResponseSchema>
