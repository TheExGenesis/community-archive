import { render, screen } from '@testing-library/react'
import { DigestSubscriberCount } from './DigestSubscriberCount'
import { getActiveDigestSubscriberCount } from '@/lib/digest/emailSubscriptions'

jest.mock('@/lib/digest/emailSubscriptions', () => ({
  getActiveDigestSubscriberCount: jest.fn(),
}))

test.each([
  [0, '0 email subscribers'],
  [1, '1 email subscriber'],
  [1234, '1,234 email subscribers'],
] as const)('displays %s subscribers', async (count, label) => {
  jest.mocked(getActiveDigestSubscriberCount).mockResolvedValueOnce(count)
  render(await DigestSubscriberCount())
  expect(screen.getByText(label)).toBeInTheDocument()
})

test('omits an unavailable count without breaking the digest', async () => {
  jest
    .mocked(getActiveDigestSubscriberCount)
    .mockRejectedValueOnce(new Error('Unavailable'))
  expect(await DigestSubscriberCount()).toBeNull()
})
