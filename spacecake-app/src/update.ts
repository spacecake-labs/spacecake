/**
 * Sets up the update service
 */
export async function setupUpdates() {
  // We delay this work by 10s to ensure that the
  // app doesn't have to worry about updating during launch
  setTimeout(async () => {
    const { updateElectronApp } = await import("update-electron-app")

    updateElectronApp({
      repo: "spacecake-labs/spacecake-releases",
      updateInterval: "1 hour",
    })
  }, 10000)
}
