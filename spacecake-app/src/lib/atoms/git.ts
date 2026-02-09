import { atom } from "jotai"

export const gitBranchAtom = atom<string | null>(null)

export type GitStatus = {
  modified: string[]
  staged: string[]
  untracked: string[]
  deleted: string[]
}

export const gitStatusAtom = atom<GitStatus | null>(null)

export type GitCommit = {
  hash: string
  message: string
  author: string
  date: Date
  files: string[]
}

export const gitCommitsAtom = atom<GitCommit[]>([])

// Loading state for git status
export const gitStatusLoadingAtom = atom<boolean>(false)
