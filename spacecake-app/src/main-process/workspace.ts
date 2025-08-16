// import path from "path";

// /**
//  * Extracts the workspace name from a full path
//  * @param dirPath - The full workspace path
//  * @param platform - The platform to use for path handling (defaults to current platform)
//  * @returns The workspace name (last part of the path) or "spacecake" as fallback
//  */
// export function getWorkspaceName(
//   dirPath: string,
//   platform: NodeJS.Platform = process.platform
// ): string {
//   if (!dirPath) return "spacecake";
//   const pathModule = platform === "win32" ? path.win32 : path.posix;
//   return pathModule.basename(dirPath) || "spacecake";
// }
