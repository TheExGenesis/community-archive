// workflow is ESM-only; its RunExpiredError.is checks the error's name.
jest.mock('workflow/errors', () => ({
  RunExpiredError: {
    is: (value: unknown) =>
      value instanceof Error && value.name === 'RunExpiredError',
  },
}))

import type { UIMessageChunk } from 'ai'
import { closeWhenRunEnds, endWithFinish, finishedStream } from './stream'

const chunks = (...values: UIMessageChunk[]) =>
  new ReadableStream<UIMessageChunk>({
    start(controller) {
      values.forEach((value) => controller.enqueue(value))
      controller.close()
    },
  })

const failingAfter = (value: UIMessageChunk, error: Error) =>
  new ReadableStream<UIMessageChunk>({
    pull(controller) {
      if (!this.sent) {
        controller.enqueue(value)
        ;(this as { sent?: boolean }).sent = true
      } else controller.error(error)
    },
  } as UnderlyingDefaultSource<UIMessageChunk> & { sent?: boolean })

async function read(stream: ReadableStream<UIMessageChunk>) {
  const out: string[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out.push(value.type)
  }
}

const expired = () =>
  Object.assign(new Error('expired'), { name: 'RunExpiredError' })

describe('agent search streams', () => {
  test('a finished run passes through unchanged', async () => {
    expect(
      await read(
        endWithFinish(
          chunks(
            { type: 'start' },
            { type: 'text-delta', id: 't', delta: 'hi' },
            { type: 'finish' },
          ),
        ),
      ),
    ).toEqual(['start', 'text-delta', 'finish'])
  })

  test('a stream closed without a finish, as on cancel, gets one', async () => {
    expect(await read(endWithFinish(chunks({ type: 'start' })))).toEqual([
      'start',
      'finish',
    ])
  })

  test('an expired stream ends with a finish instead of an error', async () => {
    expect(
      await read(endWithFinish(failingAfter({ type: 'start' }, expired()))),
    ).toEqual(['start', 'finish'])
  })

  test('other read errors still fail, so the page reconnects', async () => {
    await expect(
      read(
        endWithFinish(failingAfter({ type: 'start' }, new Error('network'))),
      ),
    ).rejects.toThrow('network')
  })

  test('a stream left open after its run ended, as on cancel, fails so the page reconnects', async () => {
    let cancelled = false
    const open = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' })
      },
      cancel() {
        cancelled = true
      },
    })
    let checks = 0
    const ended = async () => ++checks >= 2
    const out: string[] = []
    const reader = endWithFinish(open, ended, 5).getReader()
    out.push((await reader.read()).value?.type as string)
    // The reconnect gets a plain finish from the stream route; this stream
    // cannot say whether anything was still on its way.
    await expect(reader.read()).rejects.toThrow(/stayed open/)
    expect(out).toEqual(['start'])
    expect(checks).toBe(2)
    expect(cancelled).toBe(true)
  })

  test('a chunk still on its way after the run ended is not cut off by a finish', async () => {
    // The run is over; its last words land after the quiet window.
    let late: NodeJS.Timeout | undefined
    const source = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'text-delta', id: 't', delta: 'Partial' })
        late = setTimeout(() => {
          controller.enqueue({ type: 'text-delta', id: 't', delta: ' end' })
          controller.close()
        }, 1_150)
      },
      cancel() {
        clearTimeout(late)
      },
    })
    const out: UIMessageChunk[] = []
    const reader = endWithFinish(source, async () => true, 5).getReader()
    out.push((await reader.read()).value as UIMessageChunk)
    await expect(reader.read()).rejects.toThrow(/stayed open/)
    expect(out).toEqual([{ type: 'text-delta', id: 't', delta: 'Partial' }])
  })

  test('keeps chunks that arrive while it checks whether the run ended', async () => {
    let push: (chunk: UIMessageChunk) => void = () => {}
    const slow = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' })
        push = (chunk) => controller.enqueue(chunk)
      },
    })
    // The run is over, but its last chunk lands just after the first check.
    const ended = async () => {
      setTimeout(() => push({ type: 'finish' }), 1)
      return true
    }
    expect(await read(endWithFinish(slow, ended, 5))).toEqual([
      'start',
      'finish',
    ])
  })

  test('a run with nothing to replay is just a finish', async () => {
    expect(await read(finishedStream())).toEqual(['finish'])
  })
})

describe('a run stream that closes early', () => {
  const raw = (...values: number[]) =>
    new ReadableStream<number>({
      start(controller) {
        values.forEach((value) => controller.enqueue(value))
        controller.close()
      },
    })
  async function drain(stream: ReadableStream<number>) {
    const out: number[] = []
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return out
      out.push(value)
    }
  }

  test('closes when the run is over', async () => {
    expect(await drain(closeWhenRunEnds(raw(1, 2), async () => true))).toEqual([
      1, 2,
    ])
  })

  test('fails, so the page reconnects, when the run is still going', async () => {
    const out: number[] = []
    const reader = closeWhenRunEnds(raw(1), async () => false).getReader()
    out.push((await reader.read()).value as number)
    await expect(reader.read()).rejects.toThrow(/still going/)
    expect(out).toEqual([1])
  })

  test('a close seen while the run is going fails even when the run ends right after', async () => {
    // The chunks written after the close are only on the replay.
    let calls = 0
    const ended = async () => ++calls > 1
    const reader = closeWhenRunEnds(raw(1), ended).getReader()
    expect((await reader.read()).value).toBe(1)
    await expect(reader.read()).rejects.toThrow(/still going/)
  })
})
