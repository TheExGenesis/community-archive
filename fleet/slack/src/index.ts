// fleet-slack: the Slack agent of the Community Archive fleet. Socket Mode
// (the box accepts no inbound connections), one long-running process under
// the fleet-slack.service user unit via `fleet-run slack`.
import fs from 'node:fs'
import bolt from '@slack/bolt'
import type { App as BoltApp } from '@slack/bolt'
import { Bot } from './bot.js'
import { Commands } from './commands.js'
import { loadConfig } from './config.js'
import { loadTranscriptLib } from './fleetLib.js'
import { FleetTask } from './fleetTask.js'
import { createTokenProvider } from './github.js'
import { claudeClassifier, Intake } from './intake.js'
import { createLogger, errorMessage } from './log.js'
import { TaskRunner } from './runner.js'
import { boltSlackClient } from './slack.js'
import { Store } from './store.js'

const { App, LogLevel } = bolt

async function main(): Promise<void> {
  const log = createLogger({ svc: 'fleet-slack' })
  const cfg = loadConfig()
  const instructions = () => {
    try {
      return fs.readFileSync(cfg.instructionsPath, 'utf8')
    } catch (err) {
      log.warn(
        'INSTRUCTIONS.md unreadable; running with the fallback rule set',
        { error: errorMessage(err) },
      )
      return 'You are the Community Archive fleet agent. Never push to main. Tier 1 paths (supabase/**, user-data deletion, consent, service role, keys, email, spend) always end in a PR a human merges. Ask in the thread when unsure.'
    }
  }
  const store = new Store(cfg.dbPath)
  const tokens = createTokenProvider({
    staticToken: cfg.githubToken,
    mintScript: cfg.githubTokenScript,
    baseEnv: cfg.env,
  })
  const fleet = new FleetTask(cfg, tokens)
  const lib = await loadTranscriptLib(cfg.fleetRoot)

  const app: BoltApp = new App({
    token: cfg.botToken,
    appToken: cfg.appToken,
    socketMode: true,
    logLevel: LogLevel.WARN,
  })
  const slack = boltSlackClient(app.client)
  const auth = await app.client.auth.test()
  const botUserId = auth.user_id ? String(auth.user_id) : undefined

  const runner = new TaskRunner({
    cfg,
    store,
    fleet,
    slack,
    log: log.child({ part: 'runner' }),
    lib,
    instructions,
  })
  const commands = new Commands({
    cfg,
    store,
    tokens,
    log: log.child({ part: 'commands' }),
  })
  const bot = new Bot({
    cfg,
    store,
    runner,
    commands,
    slack,
    fleet,
    log: log.child({ part: 'bot' }),
    botUserId,
  })
  const intake = new Intake({
    cfg,
    store,
    fleet,
    slack,
    log: log.child({ part: 'intake' }),
    classify: claudeClassifier({
      cfg,
      fleet,
      lib,
      log: log.child({ part: 'triage' }),
      instructions,
    }),
  })

  app.event('app_mention', async ({ event }) => {
    const e = event as unknown as {
      channel: string
      ts: string
      thread_ts?: string
      user?: string
      text?: string
      bot_id?: string
      subtype?: string
    }
    await bot.onMention({
      channel: e.channel,
      ts: e.ts,
      threadTs: e.thread_ts,
      user: e.user,
      text: e.text || '',
      botId: e.bot_id,
      subtype: e.subtype,
    })
  })
  app.message(async ({ message }) => {
    const m = message as unknown as {
      channel: string
      ts: string
      thread_ts?: string
      user?: string
      text?: string
      channel_type?: string
      bot_id?: string
      subtype?: string
    }
    await bot.onMessage({
      channel: m.channel,
      ts: m.ts,
      threadTs: m.thread_ts,
      user: m.user,
      text: m.text || '',
      channelType: m.channel_type,
      botId: m.bot_id,
      subtype: m.subtype,
    })
  })
  for (const actionId of ['merge_pr', 'not_now', 'go_ahead']) {
    app.action({ action_id: actionId }, async ({ ack, body, action }) => {
      await ack()
      const b = body as unknown as {
        user: { id: string }
        channel?: { id: string }
        message?: { ts: string; thread_ts?: string }
      }
      const act = action as unknown as { value?: string }
      await bot.onAction({
        actionId,
        value: act.value || '',
        user: b.user.id,
        channel: b.channel?.id || '',
        messageTs: b.message?.ts || '',
        threadTs: b.message?.thread_ts,
      })
    })
  }
  app.error(async (err) => {
    log.error('bolt error', { error: errorMessage(err) })
  })

  await app.start()
  log.info('connected', {
    bot: botUserId,
    channel: cfg.signalsChannel,
    allowed: [...cfg.allowedUserIds].join(','),
    repo: cfg.repo,
    runs: cfg.runsDir,
    db: cfg.dbPath,
    github: tokens.describe(),
    intake: cfg.intakeEnabled ? `${cfg.intakeIntervalMs / 1000}s` : 'off',
  })

  let intakeTimer: NodeJS.Timeout | undefined
  if (cfg.intakeEnabled) {
    const tick = async () => {
      const r = await intake.tick()
      if (r.posted) log.info('intake', r)
    }
    setTimeout(() => void tick(), 15000).unref()
    intakeTimer = setInterval(() => void tick(), cfg.intakeIntervalMs)
  }

  const shutdown = async (signal: string) => {
    log.info('stopping', { signal, activeTasks: runner.activeCount() })
    if (intakeTimer) clearInterval(intakeTimer)
    try {
      await app.stop()
    } catch {
      // already closed
    }
    store.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  process.stderr.write(`fleet-slack: ${errorMessage(err)}\n`)
  process.exit(1)
})
