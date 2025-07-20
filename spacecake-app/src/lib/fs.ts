import type { FileEntry, ReadDirectoryResult } from "@/types/electron";

const openDirectory = async (): Promise<string | null> => {
  try {
    const result = await window.electronAPI.showOpenDialog({
      properties: ["openDirectory"],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      return selectedPath;
    }
    return null;
  } catch (error) {
    console.error("Error opening folder:", error);
    return null;
  }
};

const readDirectory = async (dirPath: string): Promise<FileEntry[]> => {
  try {
    const result: ReadDirectoryResult =
      await window.electronAPI.readDirectory(dirPath);

    if (result.success && result.files) {
      return result.files;
    } else {
      console.error("failed to read directory:", result.error);
      return [];
    }
  } catch (error) {
    console.error("error reading directory:", error);
    return [];
  }
};

export { openDirectory, readDirectory };
