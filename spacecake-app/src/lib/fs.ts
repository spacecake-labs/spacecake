import type {
  FileEntry,
  ReadDirectoryResult,
  ReadWorkspaceResult,
  WorkspaceInfo,
} from "@/types/electron";

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

const readWorkspace = async (
  dirPath: string
): Promise<{ files: FileEntry[]; workspace: WorkspaceInfo } | null> => {
  try {
    const result: ReadWorkspaceResult =
      await window.electronAPI.readWorkspace(dirPath);

    if (result.success && result.files && result.workspace) {
      return {
        files: result.files,
        workspace: result.workspace,
      };
    } else {
      console.error("failed to read workspace:", result.error);
      return null;
    }
  } catch (error) {
    console.error("error reading workspace:", error);
    return null;
  }
};

const createFile = async (
  filePath: string,
  content: string = ""
): Promise<boolean> => {
  try {
    const result = await window.electronAPI.createFile(filePath, content);

    if (result.success) {
      return true;
    } else {
      console.error("failed to create file:", result.error);
      return false;
    }
  } catch (error) {
    console.error("error creating file:", error);
    return false;
  }
};

export { openDirectory, readDirectory, readWorkspace, createFile };
