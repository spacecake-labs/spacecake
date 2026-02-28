import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("migrationAPI", {
  sendDump: (dump: ArrayBuffer | null) => ipcRenderer.invoke("migration:idb-dump", dump),
})
