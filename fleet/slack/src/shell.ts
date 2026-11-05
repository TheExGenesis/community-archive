// Child processes: run to completion with captured output.
import { spawn } from 'node:child_process'

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

export interface ExecOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  input?: string
  timeoutMs?: number
  /** Bytes of stdout/stderr kept (default 8 MB each); older output is dropped. */
  maxBuffer?: number
}

export async function exec(
  file: string,
  args: string[],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  const maxBuffer = opts.maxBuffer ?? 8 * 1024 * 1024
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timer: NodeJS.Timeout | undefined
    const keep = (buf: string, chunk: string) => {
      const next = buf + chunk
      return next.length > maxBuffer
        ? next.slice(next.length - maxBuffer)
        : next
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d: string) => {
      stdout = keep(stdout, d)
    })
    child.stderr.on('data', (d: string) => {
      stderr = keep(stderr, d)
    })
    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      resolve({ code: code ?? (signal ? 128 : 1), stdout, stderr })
    })
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        stderr = keep(stderr, `\n[timed out after ${opts.timeoutMs} ms]\n`)
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000).unref()
      }, opts.timeoutMs)
    }
    if (opts.input !== undefined) child.stdin.end(opts.input)
    else child.stdin.end()
  })
}

/** exec that throws on a non-zero exit with the tail of stderr in the message. */
export async function execOk(
  file: string,
  args: string[],
  opts: ExecOptions = {},
): Promise<string> {
  const r = await exec(file, args, opts)
  if (r.code !== 0) {
    const tail = (r.stderr || r.stdout).trim().split('\n').slice(-12).join('\n')
    throw new Error(
      `${file} ${args.slice(0, 2).join(' ')} exited ${r.code}: ${tail}`,
    )
  }
  return r.stdout
}
