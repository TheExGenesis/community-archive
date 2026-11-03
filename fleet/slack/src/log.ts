// One-line structured logs to stdout; the user unit's journal picks them up.
export type LogFields = Record<string, unknown>

export interface Logger {
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
  child(fields: LogFields): Logger
}

function render(level: string, msg: string, fields: LogFields): string {
  const parts = [`${new Date().toISOString()} [${level}] ${msg}`]
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    parts.push(`${k}=${/\s/.test(s) ? JSON.stringify(s) : s}`)
  }
  return parts.join(' ')
}

export function createLogger(
  base: LogFields = {},
  sink: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Logger {
  const log =
    (level: string) =>
    (msg: string, fields: LogFields = {}) =>
      sink(render(level, msg, { ...base, ...fields }))
  return {
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (fields) => createLogger({ ...base, ...fields }, sink),
  }
}

export const silentLogger: Logger = createLogger({}, () => undefined)

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
