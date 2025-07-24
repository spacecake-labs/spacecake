import {
  Folder,
  BookOpen,
  FileText,
  Code,
  Image,
  FileWarning,
} from "lucide-react";
import type { FileEntry } from "@/types/electron";
import type { LucideIcon } from "lucide-react";

/**
 * Sidebar navigation item interface
 */
export interface SidebarNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  isDirectory?: boolean;
  items?: SidebarNavItem[] | null;
}

/**
 * Utility functions for workspace operations
 */

/**
 * Gets the appropriate icon for a file based on its extension
 * @param fileName - The name of the file
 * @returns The appropriate Lucide icon component
 */
export function getFileIcon(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "md":
    case "txt":
    case "doc":
    case "docx":
      return BookOpen;
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "py":
    case "java":
    case "cpp":
    case "c":
    case "cs":
    case "php":
    case "rb":
    case "go":
    case "rs":
    case "swift":
    case "kt":
      return Code;
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "svg":
    case "webp":
    case "bmp":
      return Image;
    default:
      return FileText;
  }
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
        title: file.name,
        url: `#${file.path}`,
        icon: Folder,
        isDirectory: true,
        items: null, // not loaded yet
      });
    } else {
      navItems.push({
        title: file.name,
        url: `#${file.path}`,
        icon: getFileIcon(file.name),
        isDirectory: false,
        items: undefined,
      });
    }
  });

  // If no items found, add a default item
  if (navItems.length === 0) {
    navItems.push({
      title: "folder is empty",
      url: "#folder-is-empty",
      icon: FileWarning,
      isDirectory: true,
      items: [],
    });
  }

  return navItems;
}
