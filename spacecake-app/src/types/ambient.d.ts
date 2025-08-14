declare module "write-file-atomic" {
  export interface WriteFileAtomicOptions {
    encoding?: BufferEncoding;
    mode?: number;
    chown?: { uid: number; gid: number };
    fsync?: boolean;
  }

  function writeFileAtomic(
    filename: string,
    data: string | Uint8Array,
    options?: WriteFileAtomicOptions | BufferEncoding
  ): Promise<void>;

  export default writeFileAtomic;
}
