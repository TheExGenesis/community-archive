export type BulletinRefresh = {
  id: string
  created_at: string
  window_start: string
  window_end: string
  prompt_id: string
  budget_usd: number
  spent_usd: number
  status: 'queued' | 'running' | 'complete' | 'stopped'
  last_status: string | null
  counts: { rows_seen?: number; pending?: number } | null
}

export type RefreshState = {
  enabled: boolean
  requests: BulletinRefresh[]
  error?: string
}
