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

// commit form
export const commitMessageAtom = atom<string>("")
export const commitAmendAtom = atom<boolean>(false)

// operation state (prevents concurrent ops, shows spinners)
export type GitOperation = "idle" | "staging" | "committing" | "pushing" | "pulling" | "fetching"
export const gitOperationAtom = atom<GitOperation>("idle")

// remote tracking
export type GitRemoteStatus = { ahead: number; behind: number; tracking: string | null }
export const gitRemoteStatusAtom = atom<GitRemoteStatus | null>(null)

// branch list (for popover)
export const gitBranchListAtom = atom<string[]>([])

// discard confirmation
export type DiscardState =
  | { isOpen: false }
  | { isOpen: true; kind: "file"; filePath: string }
  | { isOpen: true; kind: "all" }
export const discardStateAtom = atom<DiscardState>({ isOpen: false })

// branch delete confirmation
export type BranchDeleteState = { isOpen: false } | { isOpen: true; branchName: string }
export const branchDeleteStateAtom = atom<BranchDeleteState>({ isOpen: false })
