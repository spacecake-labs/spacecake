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

export interface FileNode {
  name: string;
  isDirectory(): boolean;
}
export interface FileStat {
  size: number;
  mtime: Date;
}
export interface Fs {
  readdir: (
    dirPath: string,
    opts?: { withFileTypes?: boolean }
  ) => Promise<FileNode[]>;
  stat: (path: string) => Promise<FileStat>;
  access: (path: string) => Promise<void>;
  mkdir: (
    path: string,
    options?: { recursive?: boolean }
  ) => Promise<string | undefined>;
}

/**
 * Reads directory contents and returns sorted file entries
 * @param dirPath - The directory path to read
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Array of sorted file entries
 */
export async function readDir(
  dirPath: string,
  fsModule: Fs = fs
): Promise<FileEntry[]> {
  const entries = await fsModule.readdir(dirPath, { withFileTypes: true });

  const files = await Promise.all(
    entries.map(async (entry: FileNode) => {
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

/**
 * Ensures the .spacecake folder exists in the given workspace directory
 * @param workspacePath - The workspace directory path
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves when the folder is created or already exists
 */
export async function ensureSpacecakeFolder(
  workspacePath: string,
  fsModule: Fs = fs
): Promise<void> {
  const spacecakePath = path.join(workspacePath, ".spacecake");
  console.log("spacecakePath", spacecakePath);
  try {
    // Check if the folder already exists
    await fsModule.access(spacecakePath);
  } catch {
    // Folder doesn't exist, create it
    await fsModule.mkdir(spacecakePath, { recursive: true });
  }
}
