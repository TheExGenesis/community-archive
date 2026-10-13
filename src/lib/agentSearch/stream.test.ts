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

  test('a stream left open after its run ended, as on cancel, still finishes', async () => {
    const open = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' })
      },
    })
    let checks = 0
    const ended = async () => ++checks >= 2
    expect(await read(endWithFinish(open, ended, 5))).toEqual([
      'start',
      'finish',
    ])
    expect(checks).toBe(2)
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
    expect(
      await drain(closeWhenRunEnds(raw(1, 2), async () => true, 0)),
    ).toEqual([1, 2])
  })

  test('fails, so the page reconnects, when the run is still going', async () => {
    const out: number[] = []
    const reader = closeWhenRunEnds(raw(1), async () => false, 0).getReader()
    out.push((await reader.read()).value as number)
    await expect(reader.read()).rejects.toThrow(/still going/)
    expect(out).toEqual([1])
  })

  test('waits briefly for a status that lags the last chunk', async () => {
    let calls = 0
    const ended = async () => ++calls > 1
    expect(await drain(closeWhenRunEnds(raw(1), ended, 0))).toEqual([1])
  })
})
