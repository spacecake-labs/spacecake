import * as Brand from "effect/Brand"
import * as Schema from "effect/Schema"
export type PrimaryKey = string & Brand.Brand<"PrimaryKey">
export const PrimaryKey = Brand.nominal<PrimaryKey>()
export const PrimaryKeySchema = Schema.String.pipe(Schema.fromBrand(PrimaryKey))
