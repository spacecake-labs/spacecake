import { expect, test, describe } from "vitest";
import {
  fileTypeEmoji,
  fileTypeFromLanguage,
  transformFilesToNavItems,
  isFile,
  isFolder,
} from "@/lib/workspace";
import { BookOpen, Code, FileText, Folder } from "lucide-react";
import { FileType } from "@/types/workspace";
import type { FileEntry } from "@/types/workspace";

// fileTypeEmoji tests

describe("fileTypeEmoji", () => {
  test.each([
    [FileType.Markdown, "📖"],
    [FileType.Python, "🐍"],
    [FileType.JavaScript, "🟡"],
    [FileType.TypeScript, "🔵"],
    [FileType.JSX, "🟡"],
    [FileType.TSX, "🔵"],
    [FileType.Plaintext, "📄"],
  ])("returns correct emoji for %s", (fileType, expectedEmoji) => {
    expect(fileTypeEmoji(fileType)).toBe(expectedEmoji);
  });
});

// fileTypeFromLanguage tests

describe("fileTypeFromLanguage", () => {
  test.each([
    ["python", FileType.Python],
    ["Python", FileType.Python],
    ["PYTHON", FileType.Python],
    ["javascript", FileType.JavaScript],
    ["JavaScript", FileType.JavaScript],
    ["typescript", FileType.TypeScript],
    ["TypeScript", FileType.TypeScript],
    ["markdown", FileType.Markdown],
    ["Markdown", FileType.Markdown],
  ])("returns correct FileType for language: %s", (language, expectedType) => {
    expect(fileTypeFromLanguage(language)).toBe(expectedType);
  });

  test.each([
    ["java", FileType.Plaintext],
    ["c++", FileType.Plaintext],
    ["unknown", FileType.Plaintext],
    ["", FileType.Plaintext],
  ])(
    "returns Plaintext for unsupported languages: %s",
    (language, expectedType) => {
      expect(fileTypeFromLanguage(language)).toBe(expectedType);
    }
  );
});

// transformFilesToNavItems tests

describe("transformFilesToNavItems", () => {
  test("returns empty workspace item for empty array", () => {
    const result = transformFilesToNavItems([]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "empty",
      message: "empty",
    });
  });

  test.each([
    [
      "single directory",
      [
        {
          name: "src",
          path: "/project/src",
          type: "directory",
          size: 0,
          modified: "2024-01-01",
          isDirectory: true,
        },
      ],
      [
        {
          kind: "folder",
          title: "src",
          url: "#/project/src",
          icon: Folder,
          items: null,
        },
      ],
    ],
    [
      "single file",
      [
        {
          name: "readme.md",
          path: "/project/readme.md",
          type: "file",
          size: 1024,
          modified: "2024-01-01",
          isDirectory: false,
        },
      ],
      [
        {
          kind: "file",
          title: "readme.md",
          url: "#/project/readme.md",
          icon: BookOpen,
        },
      ],
    ],
    [
      "mixed files and directories",
      [
        {
          name: "src",
          path: "/project/src",
          type: "directory",
          size: 0,
          modified: "2024-01-01",
          isDirectory: true,
        },
        {
          name: "readme.md",
          path: "/project/readme.md",
          type: "file",
          size: 1024,
          modified: "2024-01-01",
          isDirectory: false,
        },
        {
          name: "app.tsx",
          path: "/project/app.tsx",
          type: "file",
          size: 2048,
          modified: "2024-01-01",
          isDirectory: false,
        },
      ],
      [
        {
          kind: "folder",
          title: "src",
          url: "#/project/src",
          icon: Folder,
          items: null,
        },
        {
          kind: "file",
          title: "readme.md",
          url: "#/project/readme.md",
          icon: BookOpen,
        },
        {
          kind: "file",
          title: "app.tsx",
          url: "#/project/app.tsx",
          icon: Code,
        },
      ],
    ],
  ])("transforms %s correctly", (description, input, expected) => {
    const result = transformFilesToNavItems(input as FileEntry[]);
    expect(result).toEqual(expected);
  });

  test.each([
    ["document.md", BookOpen],
    ["script.js", Code],
    ["image.png", FileText],
    ["config.json", FileText],
  ])("assigns correct icon for file: %s", (fileName, expectedIcon) => {
    const fileEntry: FileEntry = {
      name: fileName,
      path: `/project/${fileName}`,
      type: "file",
      size: 1024,
      modified: "2024-01-01",
      isDirectory: false,
    };

    const result = transformFilesToNavItems([fileEntry]);

    expect(result).toHaveLength(1);
    expect(isFile(result[0])).toBe(true);
    if (isFile(result[0])) {
      expect(result[0].icon).toBe(expectedIcon);
    }
  });

  test("assigns Folder icon and correct properties for directories", () => {
    const dirEntry: FileEntry = {
      name: "components",
      path: "/project/components",
      type: "directory",
      size: 0,
      modified: "2024-01-01",
      isDirectory: true,
    };

    const result = transformFilesToNavItems([dirEntry]);

    expect(result).toHaveLength(1);
    expect(isFolder(result[0])).toBe(true);
    if (isFolder(result[0])) {
      expect(result[0].icon).toBe(Folder);
      expect(result[0].items).toBeNull();
    }
  });

  test("preserves order of input files", () => {
    const files: FileEntry[] = [
      {
        name: "z-file.txt",
        path: "/project/z-file.txt",
        type: "file",
        size: 100,
        modified: "2024-01-01",
        isDirectory: false,
      },
      {
        name: "a-file.md",
        path: "/project/a-file.md",
        type: "file",
        size: 200,
        modified: "2024-01-01",
        isDirectory: false,
      },
      {
        name: "middle.js",
        path: "/project/middle.js",
        type: "file",
        size: 300,
        modified: "2024-01-01",
        isDirectory: false,
      },
    ];

    const result = transformFilesToNavItems(files);

    expect(result).toHaveLength(3);
    expect(isFile(result[0]) && result[0].title).toBe("z-file.txt");
    expect(isFile(result[1]) && result[1].title).toBe("a-file.md");
    expect(isFile(result[2]) && result[2].title).toBe("middle.js");
  });

  test("creates correct URLs with hash prefix", () => {
    const files: FileEntry[] = [
      {
        name: "file.txt",
        path: "/absolute/path/file.txt",
        type: "file",
        size: 100,
        modified: "2024-01-01",
        isDirectory: false,
      },
      {
        name: "folder",
        path: "relative/path/folder",
        type: "directory",
        size: 0,
        modified: "2024-01-01",
        isDirectory: true,
      },
    ];

    const result = transformFilesToNavItems(files);

    expect(isFile(result[0]) && result[0].url).toBe("#/absolute/path/file.txt");
    expect(isFolder(result[1]) && result[1].url).toBe("#relative/path/folder");
  });
});
