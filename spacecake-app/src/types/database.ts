import { Brand, Schema } from "effect"

export type PrimaryKey = string & Brand.Brand<"PrimaryKey">
export const PrimaryKey = Brand.nominal<PrimaryKey>()
export const PrimaryKeySchema = Schema.String.pipe(Schema.fromBrand(PrimaryKey))
