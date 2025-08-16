import { expect, test, describe, vi } from "vitest";
import { Fs } from "@/main-process/fs";

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
