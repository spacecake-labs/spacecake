import { expect, test, describe, vi } from "vitest";
import {
  readDir,
  sortFiles,
  Fs,
  FileNode,
  FileStat,
  ensureSpacecakeFolder,
} from "@/main-process/fs";
import type { FileEntry } from "@/types/workspace";

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
          isDirectory: () => path.includes("dir"),
        }) as FileStat,
      access: async () => {},
      mkdir: async () => undefined,
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
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
      stat: async () =>
        ({ size: 0, mtime: new Date(), isDirectory: () => false }) as FileStat,
      access: async () => {},
      mkdir: async () => undefined,
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
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
          isDirectory: () =>
            path.includes("node_modules") || path.includes("src"),
        }) as FileStat,
      access: async () => {},
      mkdir: async () => undefined,
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
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
          isDirectory: () => false,
        }) as FileStat,
      access: async () => {},
      mkdir: async () => undefined,
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
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

describe("ensureSpacecakeFolder", () => {
  test("creates .spacecake folder when it doesn't exist", async () => {
    const mockFs: Fs = {
      readdir: async () => [],
      stat: async () =>
        ({ size: 0, mtime: new Date(), isDirectory: () => false }) as FileStat,
      access: async (path: string) => {
        if (path.endsWith(".spacecake")) {
          throw new Error("ENOENT: no such file or directory");
        }
      },
      mkdir: async (path: string) => {
        // Mock successful directory creation
        if (!path.endsWith(".spacecake")) {
          throw new Error("should only create .spacecake folder");
        }
        return undefined;
      },
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
    };

    const workspacePath = "/test/workspace";

    // Should not throw
    await expect(
      ensureSpacecakeFolder(workspacePath, mockFs)
    ).resolves.toBeUndefined();
  });

  test("doesn't create .spacecake folder when it already exists", async () => {
    const mockFs: Fs = {
      readdir: async () => [],
      stat: async () =>
        ({ size: 0, mtime: new Date(), isDirectory: () => false }) as FileStat,
      access: async (path: string) => {
        // Mock that .spacecake folder already exists
        if (path.endsWith(".spacecake")) {
          return; // No error, folder exists
        }
        throw new Error("ENOENT: no such file or directory");
      },
      mkdir: async () => {
        // This should not be called if folder already exists
        throw new Error("mkdir should not be called when folder exists");
      },
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
    };

    const workspacePath = "/test/workspace";

    // Should not throw and should not call mkdir
    await expect(
      ensureSpacecakeFolder(workspacePath, mockFs)
    ).resolves.toBeUndefined();
  });

  test("creates .spacecake folder with correct path", async () => {
    let createdPath: string | null = null;

    const mockFs: Fs = {
      readdir: async () => [],
      stat: async () =>
        ({ size: 0, mtime: new Date(), isDirectory: () => false }) as FileStat,
      access: async (path: string) => {
        if (path.endsWith(".spacecake")) {
          throw new Error("ENOENT: no such file or directory");
        }
      },
      mkdir: async (path: string) => {
        createdPath = path;
        return undefined;
      },
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
    };

    const workspacePath = "/test/workspace";
    await ensureSpacecakeFolder(workspacePath, mockFs);

    expect(createdPath).toBe("/test/workspace/.spacecake");
  });

  test("handles nested workspace paths correctly", async () => {
    let createdPath: string | null = null;

    const mockFs: Fs = {
      readdir: async () => [],
      stat: async () =>
        ({ size: 0, mtime: new Date(), isDirectory: () => false }) as FileStat,
      access: async (path: string) => {
        if (path.endsWith(".spacecake")) {
          throw new Error("ENOENT: no such file or directory");
        }
      },
      mkdir: async (path: string) => {
        createdPath = path;
        return undefined;
      },
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
    };

    const workspacePath = "/Users/username/Projects/my-project";
    await ensureSpacecakeFolder(workspacePath, mockFs);

    expect(createdPath).toBe("/Users/username/Projects/my-project/.spacecake");
  });
});

describe("createFile", () => {
  test("calls writeFile with correct arguments", async () => {
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);
    const mockFs: Fs = {
      writeFile: mockWriteFile,
      readdir: async () => [],
      stat: async () => ({
        size: 0,
        mtime: new Date(),
        isDirectory: () => false,
      }),
      access: async () => {},
      mkdir: async () => undefined,
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
    };

    const filePath = "/test/file.txt";
    const content = "hello world";

    const { createFile } = await import("@/main-process/fs");
    await createFile(filePath, content, mockFs);

    expect(mockWriteFile).toHaveBeenCalledWith(filePath, content, {
      encoding: "utf8",
    });
  });

  test("throws if writeFile fails", async () => {
    const mockFs: Fs = {
      writeFile: vi.fn().mockRejectedValue(new Error("fail")),
      readdir: async () => [],
      stat: async () => ({
        size: 0,
        mtime: new Date(),
        isDirectory: () => false,
      }),
      access: async () => {},
      mkdir: async () => undefined,
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
    };

    const { createFile } = await import("@/main-process/fs");
    await expect(createFile("/fail/file.txt", "data", mockFs)).rejects.toThrow(
      "fail"
    );
  });
});

describe("renameFile", () => {
  test("successfully renames a file when new path doesn't exist", async () => {
    const mockRename = vi.fn().mockResolvedValue(undefined);
    const mockAccess = vi.fn().mockRejectedValue(new Error("ENOENT"));

    const mockFs: Fs = {
      rename: mockRename,
      access: mockAccess,
      readdir: async () => [],
      stat: async () => ({
        size: 0,
        mtime: new Date(),
        isDirectory: () => false,
      }),
      mkdir: async () => undefined,
      writeFile: async () => {},
      readFile: async () => "",
      rmdir: async () => {},
      unlink: async () => {},
    };

    const { renameFile } = await import("@/main-process/fs");
    await renameFile("/old/file.txt", "/new/file.txt", mockFs);

    expect(mockAccess).toHaveBeenCalledWith("/new/file.txt");
    expect(mockRename).toHaveBeenCalledWith("/old/file.txt", "/new/file.txt");
  });

  test("throws error when new path already exists", async () => {
    const mockAccess = vi.fn().mockResolvedValue(undefined); // File exists

    const mockFs: Fs = {
      access: mockAccess,
      readdir: async () => [],
      stat: async () => ({
        size: 0,
        mtime: new Date(),
        isDirectory: () => false,
      }),
      mkdir: async () => undefined,
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
    };

    const { renameFile } = await import("@/main-process/fs");
    await expect(
      renameFile("/old/file.txt", "/existing/file.txt", mockFs)
    ).rejects.toThrow("file or directory already exists: /existing/file.txt");
  });

  test("throws error when new path already exists (directory)", async () => {
    const mockAccess = vi.fn().mockResolvedValue(undefined); // Directory exists

    const mockFs: Fs = {
      access: mockAccess,
      readdir: async () => [],
      stat: async () => ({
        size: 0,
        mtime: new Date(),
        isDirectory: () => false,
      }),
      mkdir: async () => undefined,
      writeFile: async () => {},
      readFile: async () => "",
      rename: async () => {},
      rmdir: async () => {},
      unlink: async () => {},
    };

    const { renameFile } = await import("@/main-process/fs");
    await expect(
      renameFile("/old/dir", "/existing/dir", mockFs)
    ).rejects.toThrow("file or directory already exists: /existing/dir");
  });
});
