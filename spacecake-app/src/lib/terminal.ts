import type { ElectronAPI } from "@/types/electron"

export const createTerminal = (
  id: string,
  cols: number,
  rows: number,
  cwd?: string,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.createTerminal(id, cols, rows, cwd)

export const resizeTerminal = (
  id: string,
  cols: number,
  rows: number,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.resizeTerminal(id, cols, rows)

export const writeTerminal = (
  id: string,
  data: string,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.writeTerminal(id, data)

export const killTerminal = (
  id: string,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.killTerminal(id)

export const onTerminalOutput = (
  handler: (id: string, data: string) => void,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.onTerminalOutput(handler)
