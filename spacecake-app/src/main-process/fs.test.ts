import { expect, test, describe } from "vitest";
import { readDir, sortFiles, Fs, FileNode, FileStat } from "@/main-process/fs";
import type { FileEntry } from "@/types/electron";

describe("sortFiles", () => {
  test("sorts directories first, then files, both alphabetically", () => {
    const files: FileEntry[] = [
      {
        name: "file2.txt",
        path: "/test/file2.txt",
        type: "file",
        size: 100,
        modified: "2023-01-01",
        isDirectory: false,
      },
      {
        name: "dir1",
        path: "/test/dir1",
        type: "directory",
        size: 0,
        modified: "2023-01-01",
        isDirectory: true,
      },
      {
        name: "file1.txt",
        path: "/test/file1.txt",
        type: "file",
        size: 200,
        modified: "2023-01-01",
        isDirectory: false,
      },
      {
        name: "dir2",
        path: "/test/dir2",
        type: "directory",
        size: 0,
        modified: "2023-01-01",
        isDirectory: true,
      },
    ];

    const result = sortFiles(files);

    expect(result.map((f) => f.name)).toEqual([
      "dir1",
      "dir2",
      "file1.txt",
      "file2.txt",
    ]);
  });

  test("sorts only directories alphabetically", () => {
    const files: FileEntry[] = [
      {
        name: "dir2",
        path: "/test/dir2",
        type: "directory",
        size: 0,
        modified: "2023-01-01",
        isDirectory: true,
      },
      {
        name: "dir1",
        path: "/test/dir1",
        type: "directory",
        size: 0,
        modified: "2023-01-01",
        isDirectory: true,
      },
      {
        name: "dir3",
        path: "/test/dir3",
        type: "directory",
        size: 0,
        modified: "2023-01-01",
        isDirectory: true,
      },
    ];

    const result = sortFiles(files);

    expect(result.map((f) => f.name)).toEqual(["dir1", "dir2", "dir3"]);
  });

  test("sorts only files alphabetically", () => {
    const files: FileEntry[] = [
      {
        name: "file2.txt",
        path: "/test/file2.txt",
        type: "file",
        size: 100,
        modified: "2023-01-01",
        isDirectory: false,
      },
      {
        name: "file1.txt",
        path: "/test/file1.txt",
        type: "file",
        size: 200,
        modified: "2023-01-01",
        isDirectory: false,
      },
      {
        name: "file3.txt",
        path: "/test/file3.txt",
        type: "file",
        size: 300,
        modified: "2023-01-01",
        isDirectory: false,
      },
    ];

    const result = sortFiles(files);

    expect(result.map((f) => f.name)).toEqual([
      "file1.txt",
      "file2.txt",
      "file3.txt",
    ]);
  });

  test("handles case-sensitive sorting", () => {
    const files: FileEntry[] = [
      {
        name: "File.txt",
        path: "/test/File.txt",
        type: "file",
        size: 100,
        modified: "2023-01-01",
        isDirectory: false,
      },
      {
        name: "file.txt",
        path: "/test/file.txt",
        type: "file",
        size: 200,
        modified: "2023-01-01",
        isDirectory: false,
      },
      {
        name: "Dir",
        path: "/test/Dir",
        type: "directory",
        size: 0,
        modified: "2023-01-01",
        isDirectory: true,
      },
      {
        name: "dir",
        path: "/test/dir",
        type: "directory",
        size: 0,
        modified: "2023-01-01",
        isDirectory: true,
      },
    ];

    const result = sortFiles(files);

    expect(result.map((f) => f.name)).toEqual([
      "dir",
      "Dir",
      "file.txt",
      "File.txt",
    ]);
  });

  test("returns empty array for empty input", () => {
    const result = sortFiles([]);
    expect(result).toEqual([]);
  });
});

describe("readDir", () => {
  test("sorts directories first, then files, both alphabetically", async () => {
    const mockFs: Fs = {
      readdir: async () => [
        { name: "file2.txt", isDirectory: () => false } as FileNode,
        { name: "dir1", isDirectory: () => true } as FileNode,
        { name: "file1.txt", isDirectory: () => false } as FileNode,
        { name: "dir2", isDirectory: () => true } as FileNode,
      ],
      stat: async (path: string) =>
        ({
          size: path.includes("dir") ? 0 : 100,
          mtime: new Date("2023-01-01"),
        }) as FileStat,
    };

    const result = await readDir("/test/path", mockFs);

    expect(result.map((f) => f.name)).toEqual([
      "dir1",
      "dir2",
      "file1.txt",
      "file2.txt",
    ]);
    expect(result[0].isDirectory).toBe(true);
    expect(result[1].isDirectory).toBe(true);
    expect(result[2].isDirectory).toBe(false);
    expect(result[3].isDirectory).toBe(false);
  });

  test("returns empty array for empty directory", async () => {
    const mockFs: Fs = {
      readdir: async () => [],
      stat: async () => ({ size: 0, mtime: new Date() }) as FileStat,
    };

    const result = await readDir("/empty/path", mockFs);

    expect(result).toEqual([]);
  });

  test("handles mixed file types correctly", async () => {
    const mockFs: Fs = {
      readdir: async () => [
        { name: "README.md", isDirectory: () => false } as FileNode,
        { name: "src", isDirectory: () => true } as FileNode,
        { name: "package.json", isDirectory: () => false } as FileNode,
        { name: "node_modules", isDirectory: () => true } as FileNode,
      ],
      stat: async (path: string) =>
        ({
          size: path.includes("node_modules") ? 1000000 : 100,
          mtime: new Date("2023-01-01"),
        }) as FileStat,
    };

    const result = await readDir("/project", mockFs);

    expect(result.map((f) => f.name)).toEqual([
      "node_modules",
      "src",
      "package.json",
      "README.md",
    ]);
    expect(result[0].type).toBe("directory");
    expect(result[1].type).toBe("directory");
    expect(result[2].type).toBe("file");
    expect(result[3].type).toBe("file");
  });

  test("includes correct file metadata", async () => {
    const mockFs: Fs = {
      readdir: async () => [
        { name: "test.txt", isDirectory: () => false } as FileNode,
      ],
      stat: async () =>
        ({
          size: 1234,
          mtime: new Date("2023-12-25T10:30:00Z"),
        }) as FileStat,
    };

    const result = await readDir("/test", mockFs);

    expect(result[0]).toEqual({
      name: "test.txt",
      path: "/test/test.txt",
      type: "file",
      size: 1234,
      modified: "2023-12-25T10:30:00.000Z",
      isDirectory: false,
    });
  });
});
