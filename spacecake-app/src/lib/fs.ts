const openDirectory = async (): Promise<string | null> => {
  try {
    const result = await window.electronAPI.showOpenDialog({
      properties: ["openDirectory"],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      console.log("Selected folder:", selectedPath);
      return selectedPath;
    }
    return null;
  } catch (error) {
    console.error("Error opening folder:", error);
    return null;
  }
};

export { openDirectory };
