import fs from "fs/promises";
import path from "path";
import type { FileEntry } from "@/types/electron";

/**
 * Sorts file entries: directories first, then files, both alphabetically
 * @param files - Array of file entries to sort
 * @returns Sorted array of file entries
 */
export function sortFiles(files: FileEntry[]): FileEntry[] {
  return files.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Reads directory contents and returns sorted file entries
 * @param dirPath - The directory path to read
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Array of sorted file entries
 */
export async function readDir(
  dirPath: string,
  fsModule: typeof fs = fs
): Promise<FileEntry[]> {
  const entries = await fsModule.readdir(dirPath, { withFileTypes: true });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const stats = await fsModule.stat(fullPath);

      return {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        isDirectory: entry.isDirectory(),
      };
    })
  );

  return sortFiles(files);
}
