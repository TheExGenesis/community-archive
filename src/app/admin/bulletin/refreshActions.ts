'use server'

import { requireAdmin } from '@/app/admin/data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { createServerServiceRoleClient } from '@/utils/supabase'
import type { RefreshState } from '@/lib/bulletin/refresh'

async function enabled() {
  return (
    process.env.BULLETIN_REFRESH_ENABLED === 'true' &&
    (await getLocalAdminPreview()) !== 'admin'
  )
}

export async function getRefreshState(): Promise<RefreshState> {
  if (!(await enabled())) return { enabled: false, requests: [] }
  await requireAdmin('/admin/bulletin')
  const { data, error } = await createServerServiceRoleClient().rpc(
    'get_bulletin_refreshes',
  )
  return error
    ? {
        enabled: true,
        requests: [],
        error: 'Refresh status could not be loaded.',
      }
    : { enabled: true, requests: data as unknown as RefreshState['requests'] }
}

export async function requestRefresh(
  form: FormData,
): Promise<{ id?: string; error?: string }> {
  if (!(await enabled()))
    return {
      error: 'Refreshes are unavailable here. Local preview is read-only.',
    }
  const { user } = await requireAdmin('/admin/bulletin')
  const selection = form.get('selection')
  const prompt = form.get('prompt_id')
  const budget = form.get('budget')
  const request = form.get('request_id')
  if (
    (selection !== 'latest' && selection !== 'two_weeks') ||
    typeof prompt !== 'string' ||
    !/^[1-9]\d*$/.test(prompt) ||
    !Number.isSafeInteger(Number(prompt)) ||
    typeof budget !== 'string' ||
    !/^(?:0\.[0-9]{1,2}|1(?:\.0{1,2})?)$/.test(budget) ||
    Number(budget) <= 0 ||
    typeof request !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      request,
    )
  )
    return { error: 'Choose a window and a spending cap between $0.01 and $1.' }
  const { data, error } = await createServerServiceRoleClient().rpc(
    'request_bulletin_refresh',
    {
      request_id: request,
      selection,
      expected_prompt_id: Number(prompt),
      budget_usd: Number(budget),
      actor_id: user.id,
    },
  )
  if (error || !data)
    return {
      error:
        error?.code === '40001'
          ? 'The saved prompt changed. Reload before requesting a refresh.'
          : error?.code === '55000'
            ? 'A refresh is already queued or running. Check its status below.'
            : error?.code === '22023'
              ? 'No previous scan window is available. Choose the last two weeks.'
              : 'Refresh could not be queued. Retry to check the same request.',
    }
  return { id: data }
}
