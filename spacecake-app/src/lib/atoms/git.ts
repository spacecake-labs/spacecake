import { atom } from "jotai"

import type { BlameLine } from "@/services/git-blame-parser"

export const gitBranchAtom = atom<string | null>(null)

// blame data for the currently active file (set by the file route)
export const activeBlameAtom = atom<BlameLine[]>([])

export type LineDiff = {
  type: "added" | "modified" | "deleted"
  startLine: number
  endLine: number
}

// line diff data for the currently active file (set by the file route)
export const activeLineDiffAtom = atom<LineDiff[]>([])

export type GitStatus = {
  modified: string[]
  staged: string[]
  untracked: string[]
  deleted: string[]
  conflicted: string[]
}

export const gitStatusAtom = atom<GitStatus | null>(null)

export type GitCommit = {
  hash: string
  message: string
  author: string
  date: Date
}

export const gitCommitsAtom = atom<GitCommit[]>([])

// lazily-loaded commit file lists (keyed by commit hash)
export const commitFilesAtom = atom<Map<string, string[]>>(new Map())

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
export const isCommittingAtom = atom((get) => get(gitOperationAtom) === "committing")
export const isBusyAtom = atom((get) => get(gitOperationAtom) !== "idle")

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

// total change count for git panel tab badge
export const gitTotalChangesAtom = atom((get) => {
  const status = get(gitStatusAtom)
  if (!status) return 0
  return (
    status.modified.length +
    status.staged.length +
    status.untracked.length +
    status.deleted.length +
    status.conflicted.length
  )
})

// git panel tab
export type GitPanelTab = "changes" | "history"
export const gitPanelTabAtom = atom<GitPanelTab>("changes")

// ui-only excluded paths (persists across tab switches)
export const gitExcludedPathsAtom = atom<Set<string>>(new Set<string>())

// branch delete confirmation
export type BranchDeleteState = { isOpen: false } | { isOpen: true; branchName: string }
export const branchDeleteStateAtom = atom<BranchDeleteState>({ isOpen: false })

// stash list
export type StashEntry = {
  index: number
  message: string
  date: string
}

export const gitStashListAtom = atom<StashEntry[]>([])

// github integration
export type GitHubRepoInfo = {
  owner: string
  repo: string
}

// remote url for origin
export const gitRemoteUrlAtom = atom<string | null>(null)

// derived github repo info (null if not a github remote)
export const gitHubRepoInfoAtom = atom<GitHubRepoInfo | null>((get) => {
  const url = get(gitRemoteUrlAtom)
  if (!url) return null
  // inline parse to avoid importing service-layer code in renderer
  const sshMatch = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }
  const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
  return null
})
