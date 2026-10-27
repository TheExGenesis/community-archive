import { createServer } from 'node:http'
import type { AddressInfo, LookupFunction } from 'node:net'
import {
  Agent,
  FormData as UndiciFormData,
  Request as UndiciRequest,
  fetch as undiciFetch,
} from 'undici'

test.each([false, true])(
  'Undici supports pinned DNS and multipart bodies with autoSelectFamily=%s',
  async (autoSelectFamily) => {
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          type: request.headers['content-type'],
          body: Buffer.concat(chunks).toString(),
        }),
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const lookup = jest.fn((hostname, options, callback) => {
      expect(hostname).toBe('preview.invalid')
      const pinned = { address: '127.0.0.1', family: 4 }
      if (options.all) callback(null, [pinned])
      else callback(null, pinned.address, pinned.family)
    })
    const dispatcher = new Agent({
      connect: { autoSelectFamily, lookup: lookup as LookupFunction },
    })
    try {
      expect(FormData).toBe(UndiciFormData)
      const form = new UndiciFormData()
      form.append('summary', 'Safe preview')
      form.append('archive', new File(['example'], 'archive.txt'))
      expect(Request).toBe(UndiciRequest)
      const request = new UndiciRequest(
        `http://preview.invalid:${(server.address() as AddressInfo).port}/`,
        { method: 'POST', body: form },
      )
      const response = await undiciFetch(request, {
        dispatcher,
        signal: AbortSignal.timeout(2000),
      })
      expect(response.ok).toBe(true)
      const result = (await response.json()) as { type: string; body: string }
      expect(result.type).toMatch(/^multipart\/form-data; boundary=/)
      expect(result.body).toContain('Safe preview')
      expect(result.body).toContain('filename="archive.txt"')
      expect(lookup).toHaveBeenCalledWith(
        'preview.invalid',
        expect.any(Object),
        expect.any(Function),
      )
      expect(Boolean(lookup.mock.calls[0][1].all)).toBe(autoSelectFamily)
    } finally {
      await dispatcher.close()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
)
