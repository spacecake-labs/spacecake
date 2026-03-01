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

// Selected commit in git panel: "working-tree" or a commit hash
export const selectedCommitAtom = atom<string>("working-tree")

// whether the workspace is a git repo (shared between git panel and status bar)
export const isGitRepoAtom = atom<boolean | null>(null)
