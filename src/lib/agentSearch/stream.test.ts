// workflow is ESM-only; its RunExpiredError.is checks the error's name.
jest.mock('workflow/errors', () => ({
  RunExpiredError: {
    is: (value: unknown) =>
      value instanceof Error && value.name === 'RunExpiredError',
  },
}))

import type { UIMessageChunk } from 'ai'
import { endWithFinish, finishedStream } from './stream'

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

  test('a run with nothing to replay is just a finish', async () => {
    expect(await read(finishedStream())).toEqual(['finish'])
  })
})
