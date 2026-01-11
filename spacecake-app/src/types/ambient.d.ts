declare module "write-file-atomic" {
  export interface WriteFileAtomicOptions {
    encoding?: BufferEncoding
    mode?: number
    chown?: { uid: number; gid: number }
    fsync?: boolean
  }

  function writeFileAtomic(
    filename: string,
    data: string | Uint8Array,
    options?: WriteFileAtomicOptions | BufferEncoding
  ): Promise<void>

  export default writeFileAtomic
}

// SVG imports as React components
declare module "*.svg?react" {
  import { FC, SVGProps } from "react"
  const content: FC<SVGProps<SVGElement>>
  export default content
}

interface Window {
  $crisp: unknown[]
  CRISP_WEBSITE_ID: string
}
