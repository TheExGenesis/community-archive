export const SHELF_ROWS = [
  'books',
  'reading',
  'watching',
  'listening',
  'playing',
  'tools',
  'other',
  'made',
  'links',
  'mentioned',
] as const
export type ShelfRowKey = (typeof SHELF_ROWS)[number]

export const SHELF_MARKS = [
  'loved',
  'liked',
  'recommended',
  'disliked',
  'hated',
] as const
export type ShelfMark = (typeof SHELF_MARKS)[number]

/**
 * What the member did with a work, strongest first (services/shelf/view.py
 * RELATIONS). The names are medium-neutral; the page turns them into verbs
 * for the medium ("Read", "Played", "Used"), with a generic fallback.
 */
export const SHELF_RELATIONS = [
  'made',
  'experienced',
  'in_progress',
  'intends',
  'not_yet',
  'discussed',
  'cited',
  'referenced',
  'shared',
  'mentioned',
] as const
export type ShelfRelation = (typeof SHELF_RELATIONS)[number]

/**
 * Read status. 'changed' is an approved item whose public content changed
 * since approval: hidden from the public until the owner approves it again.
 */
export const SHELF_STATUSES = [
  'pending',
  'approved',
  'hidden',
  'changed',
] as const
export type ShelfStatus = (typeof SHELF_STATUSES)[number]

/** What an owner can write. 'pending' clears the decision. */
export const SHELF_DECISIONS = ['pending', 'approved', 'hidden'] as const
export type ShelfDecision = (typeof SHELF_DECISIONS)[number]

/**
 * The decision that keeps an item where it is when a write must carry a
 * status (a rename). A changed item cannot be restored to its earlier
 * approval, so it stays in review as pending.
 */
export const shelfDecisionFor = (status: ShelfStatus): ShelfDecision =>
  status === 'changed' ? 'pending' : status

/** One work on a member's shelf. Each work appears once. */
export interface ShelfItem {
  workKey: string
  /** Short digest of workKey; addresses the item in cover and evidence URLs. */
  key: string
  row: ShelfRowKey
  medium: string
  /** Owner title override when set, otherwise the derived label. */
  label: string
  /** The derived label is a placeholder (for example a bare URL). */
  needsTitle: boolean
  creator: string | null
  url: string | null
  marks: ShelfMark[]
  evidenceTweetIds: string[]
  firstAt: string
  lastAt: string
  /** Same-origin proxy path, never the remote image URL. */
  coverPath: string | null
  imageSource: string | null
  status: ShelfStatus
  /** Null until the worker has asked what the member did with it. */
  relation: ShelfRelation | null
  /** A finer format within the medium ('film', 'tv', 'video', 'podcast', 'music'), when known. */
  format: string | null
  /**
   * Other current members whose own tweets link to or name this work, most
   * tweets first (at most 50). Derived by services/shelf/echoes.py.
   */
  echoAccountIds: string[]
}

/** A member shown as a face next to a work they also tweeted about. */
export interface ShelfPerson {
  accountId: string
  username: string
  name: string | null
  avatar: string | null
}

export interface ShelfRow {
  key: ShelfRowKey
  items: ShelfItem[]
}

export interface Shelf {
  accountId: string
  rows: ShelfRow[]
  total: number
}
