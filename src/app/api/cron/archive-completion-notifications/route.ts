import { NextRequest, NextResponse } from 'next/server'
import {
  isAuthorizedCronRequest,
  sendArchiveCompletionEmail,
  type ClaimedArchiveCompletionNotification,
} from '@/lib/archiveCompletionNotifications'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const claimLimit = 20

export async function GET(request: NextRequest) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get('authorization'),
      process.env.CRON_SECRET,
    )
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.ARCHIVE_NOTIFICATION_FROM

  if (!apiKey || !from) {
    return NextResponse.json(
      { error: 'Notification delivery is not configured' },
      { status: 503 },
    )
  }

  const supabase = createServerServiceRoleClient()
  const { data, error } = await supabase.rpc(
    'claim_archive_completion_notifications',
    { p_limit: claimLimit },
  )

  if (error) {
    console.error('Failed to claim archive completion notifications', error)
    return NextResponse.json({ error: 'Unable to claim work' }, { status: 500 })
  }

  const notifications = (data || []) as ClaimedArchiveCompletionNotification[]
  const results = await Promise.allSettled(
    notifications.map(async (notification) => {
      try {
        const providerMessageId = await sendArchiveCompletionEmail({
          notification,
          apiKey,
          from,
        })
        const { error: finishError } = await supabase.rpc(
          'finish_archive_completion_notification',
          {
            p_id: notification.id,
            p_provider_message_id: providerMessageId,
            p_error: undefined,
          },
        )
        if (finishError) throw finishError
        return { id: notification.id, sent: true }
      } catch (deliveryError) {
        const message =
          deliveryError instanceof Error
            ? deliveryError.message
            : 'Unknown delivery error'
        const { error: finishError } = await supabase.rpc(
          'finish_archive_completion_notification',
          {
            p_id: notification.id,
            p_provider_message_id: undefined,
            p_error: message,
          },
        )
        if (finishError) {
          throw new Error(`Delivery and queue update failed: ${message}`)
        }
        throw deliveryError
      }
    }),
  )

  const failed = results.filter((result) => result.status === 'rejected').length
  const sent = notifications.length - failed
  const { error: runStateError } = await supabase.rpc(
    'finish_archive_completion_notification_run',
    {
      p_claimed: notifications.length,
      p_sent: sent,
      p_failed: failed,
      p_error: failed > 0 ? `${failed} deliveries failed` : undefined,
    },
  )

  if (runStateError) {
    console.error(
      'Failed to record notification worker heartbeat',
      runStateError,
    )
    return NextResponse.json(
      {
        claimed: notifications.length,
        sent,
        failed,
        error: 'Heartbeat failed',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    claimed: notifications.length,
    sent,
    failed,
  })
}
