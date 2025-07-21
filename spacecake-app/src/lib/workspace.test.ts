import { expect, test, describe } from "vitest";
import { getFileIcon, transformFilesToNavItems } from "@/lib/workspace";
import {
  BookOpen,
  Code,
  Image,
  FileText,
  Folder,
  FileWarning,
} from "lucide-react";
import type { FileEntry } from "@/types/electron";

// getFileIcon tests

describe("getFileIcon", () => {
  test.each([
    ["document.md", BookOpen],
    ["readme.txt", BookOpen],
    ["report.doc", BookOpen],
    ["document.docx", BookOpen],
    ["DOCUMENT.MD", BookOpen], // case insensitive
    ["README.TXT", BookOpen],
  ])("returns BookOpen for document files: %s", (fileName, expectedIcon) => {
    expect(getFileIcon(fileName)).toBe(expectedIcon);
  });

  test.each([
    ["script.js", Code],
    ["component.tsx", Code],
    ["app.py", Code],
    ["main.java", Code],
    ["program.cpp", Code],
    ["file.c", Code],
    ["app.cs", Code],
    ["index.php", Code],
    ["script.rb", Code],
    ["main.go", Code],
    ["lib.rs", Code],
    ["app.swift", Code],
    ["Main.kt", Code],
    ["SCRIPT.JS", Code], // case insensitive
    ["COMPONENT.TSX", Code],
  ])("returns Code for programming files: %s", (fileName, expectedIcon) => {
    expect(getFileIcon(fileName)).toBe(expectedIcon);
  });

  test.each([
    ["photo.jpg", Image],
    ["image.jpeg", Image],
    ["logo.png", Image],
    ["icon.gif", Image],
    ["vector.svg", Image],
    ["picture.webp", Image],
    ["banner.bmp", Image],
    ["PHOTO.JPG", Image], // case insensitive
    ["IMAGE.PNG", Image],
  ])("returns Image for image files: %s", (fileName, expectedIcon) => {
    expect(getFileIcon(fileName)).toBe(expectedIcon);
  });

  test.each([
    ["data.csv", FileText],
    ["config.json", FileText],
    ["package.xml", FileText],
    ["file.pdf", FileText],
    ["archive.zip", FileText],
    ["unknown.xyz", FileText],
    ["no-extension", FileText], // no extension
    ["multiple.dots.file", FileText], // multiple dots
    ["", FileText], // empty string
  ])("returns FileText for other files: %s", (fileName, expectedIcon) => {
    expect(getFileIcon(fileName)).toBe(expectedIcon);
  });
});

// transformFilesToNavItems tests

describe("transformFilesToNavItems", () => {
  test("returns empty workspace item for empty array", () => {
    const result = transformFilesToNavItems([]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: "worspace is empty",
      url: "#workspace-is-empty",
      icon: FileWarning,
      isDirectory: true,
      items: [],
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
          title: "src",
          url: "#/project/src",
          icon: Folder,
          isDirectory: true,
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
          title: "readme.md",
          url: "#/project/readme.md",
          icon: BookOpen,
          isDirectory: false,
          items: undefined,
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
          title: "src",
          url: "#/project/src",
          icon: Folder,
          isDirectory: true,
          items: null,
        },
        {
          title: "readme.md",
          url: "#/project/readme.md",
          icon: BookOpen,
          isDirectory: false,
          items: undefined,
        },
        {
          title: "app.tsx",
          url: "#/project/app.tsx",
          icon: Code,
          isDirectory: false,
          items: undefined,
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
    ["image.png", Image],
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
    expect(result[0].icon).toBe(expectedIcon);
    expect(result[0].isDirectory).toBe(false);
    expect(result[0].items).toBeUndefined();
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
    expect(result[0].icon).toBe(Folder);
    expect(result[0].isDirectory).toBe(true);
    expect(result[0].items).toBeNull();
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
    expect(result[0].title).toBe("z-file.txt");
    expect(result[1].title).toBe("a-file.md");
    expect(result[2].title).toBe("middle.js");
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

    expect(result[0].url).toBe("#/absolute/path/file.txt");
    expect(result[1].url).toBe("#relative/path/folder");
  });
});
