import { Folder, BookOpen, FileText, Code } from "lucide-react";
import type { FileEntry } from "@/types/workspace";
import type { LucideIcon } from "lucide-react";
import { FileType } from "@/types/workspace";

/**
 * Tagged union for sidebar navigation items
 */
export type SidebarNavItem =
  | {
      kind: "file";
      title: string;
      url: string;
      icon: LucideIcon;
      isActive?: boolean;
    }
  | {
      kind: "folder";
      title: string;
      url: string;
      icon: LucideIcon;
      isActive?: boolean;
      items?: SidebarNavItem[] | null;
    }
  | {
      kind: "empty";
      message: string;
    };

/**
 * Type guards for better type safety
 */
export function isFile(
  item: SidebarNavItem
): item is Extract<SidebarNavItem, { kind: "file" }> {
  return item.kind === "file";
}

export function isFolder(
  item: SidebarNavItem
): item is Extract<SidebarNavItem, { kind: "folder" }> {
  return item.kind === "folder";
}

export function isEmpty(
  item: SidebarNavItem
): item is Extract<SidebarNavItem, { kind: "empty" }> {
  return item.kind === "empty";
}

/**
 * Utility functions for workspace operations
 */

/**
 * Gets the file type based on the file extension
 * @param extension - The file extension (with or without leading dot)
 * @returns The FileType enum value
 */
export function fileTypeFromExtension(extension: string): FileType {
  const cleanExtension = extension.replace(/^\./, "").toLowerCase();

  switch (cleanExtension) {
    case "md":
    case "markdown":
      return FileType.Markdown;
    case "py":
      return FileType.Python;
    case "js":
      return FileType.JavaScript;
    case "ts":
      return FileType.TypeScript;
    case "jsx":
      return FileType.JSX;
    case "tsx":
      return FileType.TSX;
    default:
      return FileType.Plaintext;
  }
}

/**
 * Gets the file type based on the language name (e.g., from CodeMirror)
 * @param language - The language name
 * @returns The FileType enum value
 */
export function fileTypeFromLanguage(language: string): FileType {
  const cleanLanguage = language.toLowerCase();

  switch (cleanLanguage) {
    case "markdown":
      return FileType.Markdown;
    case "python":
      return FileType.Python;
    case "javascript":
      return FileType.JavaScript;
    case "typescript":
      return FileType.TypeScript;
    case "jsx":
      return FileType.JSX;
    case "tsx":
      return FileType.TSX;
    default:
      return FileType.Plaintext;
  }
}

/**
 * Gets the appropriate icon for a file type
 * @param fileType - The FileType enum value
 * @returns The appropriate Lucide icon component
 */
export function fileTypeIcon(fileType: FileType): LucideIcon {
  switch (fileType) {
    case FileType.Markdown:
      return BookOpen;
    case FileType.Python:
    case FileType.JavaScript:
    case FileType.TypeScript:
    case FileType.JSX:
    case FileType.TSX:
      return Code;
    case FileType.Plaintext:
    default:
      return FileText;
  }
}

/**
 * Gets the appropriate emoji for a file type
 * @param fileType - The FileType enum value
 * @returns The appropriate emoji string
 */
export function fileTypeEmoji(fileType: FileType): string {
  switch (fileType) {
    case FileType.Markdown:
      return "📝";
    case FileType.Python:
      return "🐍";
    case FileType.JavaScript:
    case FileType.JSX:
      return "🟡";
    case FileType.TypeScript:
    case FileType.TSX:
      return "🔵";
    case FileType.Plaintext:
    default:
      return "📄";
  }
}

/**
 * Gets the file type based on the file extension
 * @param fileName - The name of the file
 * @returns The FileType enum value
 * @deprecated Use fileTypeFromExtension instead
 */
export function getFileType(fileName: string): FileType {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return fileTypeFromExtension(extension);
}

/**
 * Transforms file entries into sidebar navigation items
 * @param files - Array of file entries from the workspace
 * @returns Array of sidebar navigation items
 */
export function transformFilesToNavItems(files: FileEntry[]): SidebarNavItem[] {
  const navItems: SidebarNavItem[] = [];

  // Show each file/directory exactly as it is
  files.forEach((file) => {
    if (file.isDirectory) {
      navItems.push({
        kind: "folder",
        title: file.name,
        url: `#${file.path}`,
        icon: Folder,
        items: null, // not loaded yet
      });
    } else {
      navItems.push({
        kind: "file",
        title: file.name,
        url: `#${file.path}`,
        icon: fileTypeIcon(
          fileTypeFromExtension(file.name.split(".").pop() || "")
        ),
      });
    }
  });

  // If no items found, add an empty state
  if (navItems.length === 0) {
    navItems.push({
      kind: "empty",
      message: "empty",
    });
  }

  return navItems;
}

/**
 * Transforms file entries into sidebar navigation items for folder contents
 * This version doesn't add an empty state item since empty folders should be handled differently
 * @param files - Array of file entries from the folder
 * @returns Array of sidebar navigation items
 */
export function transformFolderContents(files: FileEntry[]): SidebarNavItem[] {
  const navItems: SidebarNavItem[] = [];

  // Show each file/directory exactly as it is
  files.forEach((file) => {
    if (file.isDirectory) {
      navItems.push({
        kind: "folder",
        title: file.name,
        url: `#${file.path}`,
        icon: Folder,
        items: null, // not loaded yet
      });
    } else {
      navItems.push({
        kind: "file",
        title: file.name,
        url: `#${file.path}`,
        icon: fileTypeIcon(
          fileTypeFromExtension(file.name.split(".").pop() || "")
        ),
      });
    }
  });

  return navItems;
}

/**
 * Transforms file entries into a tree structure for recursive rendering
 * Uses the existing SidebarNavItem type instead of any
 * @param files - Array of file entries from the workspace
 * @returns Array of sidebar navigation items
 */
export function transformFilesToTree(files: FileEntry[]): SidebarNavItem[] {
  return transformFilesToNavItems(files);
}

/**
 * Builds a tree structure with folder contents
 * @param files - Array of file entries from the workspace
 * @returns Object mapping folder paths to their contents
 */
export function buildFileTree(
  files: FileEntry[]
): Record<string, SidebarNavItem[]> {
  const tree: Record<string, SidebarNavItem[]> = {};

  files.forEach((file) => {
    if (file.isDirectory) {
      const folderPath = file.path;
      // Initialize empty array for this folder
      if (!tree[folderPath]) {
        tree[folderPath] = [];
      }
    }
  });

  return tree;
}

/**
 * Updates the tree structure with folder contents
 * @param tree - Current tree structure
 * @param folderPath - Path of the folder to update
 * @param folderFiles - Files in the folder
 * @returns Updated tree structure
 */
export function updateFolderContents(
  tree: Record<string, SidebarNavItem[]>,
  folderPath: string,
  folderFiles: FileEntry[]
): Record<string, SidebarNavItem[]> {
  const folderItems = transformFolderContents(folderFiles);
  return {
    ...tree,
    [folderPath]: folderItems,
  };
}

/**
 * Gets the file path from a sidebar nav item
 * @param item - Sidebar navigation item
 * @returns The file path (without the leading #)
 */
export function getNavItemPath(item: SidebarNavItem): string {
  if (isFile(item) || isFolder(item)) {
    return item.url.replace(/^#/, "");
  }
  return "";
}

/**
 * Gets the file icon for a sidebar nav item
 * @param item - Sidebar navigation item
 * @returns The appropriate Lucide icon component
 */
export function getNavItemIcon(item: SidebarNavItem): LucideIcon {
  if (isFile(item) || isFolder(item)) {
    return item.icon;
  }
  return FileText; // fallback for empty items
}
