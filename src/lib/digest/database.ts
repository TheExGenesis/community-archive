import type { Json } from '@/database-types'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { cookies } from 'next/headers'

export interface DigestPromptVersionRow {
  id: string
  version: number
  label: string
  system_prompt: string
  user_prompt_template: string
  model: string
  parameters: Json
  created_by: string | null
  created_at: string
}

export interface DigestRunRow {
  id: string
  digest_date: string
  status: string
  prompt_version_id: string
  window_start: string
  window_end: string
  candidates: Json
  model_request: Json | null
  raw_response: Json | null
  parsed_output: Json | null
  events: Json
  response_id: string | null
  workflow_run_id: string | null
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  duration_ms: number | null
  error: string | null
  created_by: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

export interface DigestEditionRow {
  id: string
  issue_number: number
  digest_date: string
  version: number
  status: string
  source_run_id: string
  content: Json
  created_by: string | null
  created_at: string
  published_at: string | null
  updated_at: string
}

type TableDefinition<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type DigestDatabase = {
  public: {
    Tables: {
      digest_prompt_versions: TableDefinition<
        DigestPromptVersionRow,
        Partial<DigestPromptVersionRow> &
          Pick<
            DigestPromptVersionRow,
            'label' | 'system_prompt' | 'user_prompt_template' | 'model'
          >,
        Partial<DigestPromptVersionRow>
      >
      digest_runs: TableDefinition<
        DigestRunRow,
        Partial<DigestRunRow> &
          Pick<
            DigestRunRow,
            | 'digest_date'
            | 'prompt_version_id'
            | 'window_start'
            | 'window_end'
            | 'candidates'
          >,
        Partial<DigestRunRow>
      >
      digest_editions: TableDefinition<
        DigestEditionRow,
        Partial<DigestEditionRow> &
          Pick<
            DigestEditionRow,
            'digest_date' | 'version' | 'source_run_id' | 'content'
          >,
        Partial<DigestEditionRow>
      >
    }
    Views: { [_ in never]: never }
    Functions: {
      publish_digest_edition: {
        Args: { p_edition_id: string }
        Returns: DigestEditionRow
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export const createDigestAdminClient = () =>
  createServerServiceRoleClient() as unknown as SupabaseClient<DigestDatabase>

export const createDigestPublicClient = (
  cookieStore: ReturnType<typeof cookies>,
) =>
  createServerClient(cookieStore) as unknown as SupabaseClient<DigestDatabase>
