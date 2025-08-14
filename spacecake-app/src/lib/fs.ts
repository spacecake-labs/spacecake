import type {
  FileEntry,
  ReadDirectoryResult,
  ReadWorkspaceResult,
  WorkspaceInfo,
  File,
} from "@/types/workspace";

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

const createFolder = async (folderPath: string): Promise<boolean> => {
  try {
    const result = await window.electronAPI.createFolder(folderPath);

    if (result.success) {
      return true;
    } else {
      console.error("failed to create folder:", result.error);
      return false;
    }
  } catch (error) {
    console.error("error creating folder:", error);
    return false;
  }
};

const readFile = async (filePath: string): Promise<File | null> => {
  try {
    const result = await window.electronAPI.readFile(filePath);

    if (result.success && result.file) {
      return result.file;
    } else {
      console.error("failed to read file:", result.error);
      return null;
    }
  } catch (error) {
    console.error("error reading file:", error);
    return null;
  }
};

const renameFile = async (
  oldPath: string,
  newPath: string
): Promise<boolean> => {
  try {
    const result = await window.electronAPI.renameFile(oldPath, newPath);

    if (result.success) {
      return true;
    } else {
      console.error("failed to rename file:", result.error);
      return false;
    }
  } catch (error) {
    console.error("error renaming file:", error);
    return false;
  }
};

const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    const result = await window.electronAPI.deleteFile(filePath);

    if (result.success) {
      return true;
    } else {
      console.error("failed to delete file:", result.error);
      return false;
    }
  } catch (error) {
    console.error("error deleting file:", error);
    return false;
  }
};

const saveFile = async (
  filePath: string,
  content: string
): Promise<boolean> => {
  try {
    const result = await window.electronAPI.saveFile(filePath, content);
    if (result.success) {
      return true;
    } else {
      console.error("failed to save file:", result.error);
      return false;
    }
  } catch (error) {
    console.error("error saving file:", error);
    return false;
  }
};

export {
  openDirectory,
  readDirectory,
  readWorkspace,
  createFile,
  createFolder,
  readFile,
  renameFile,
  deleteFile,
  saveFile,
};
