import StreamPage from '@/app/stream/page'
import { getPortalData } from '@/lib/portal/data'
import type { PortalData } from '@/lib/portal/types'

jest.mock('@/lib/portal/data', () => ({
  getPortalData: jest.fn(),
}))

jest.mock('@/components/portal/Portal', () => ({
  __esModule: true,
  default: ({ view }: { view: string }) => <div>Portal view: {view}</div>,
}))

const getPortalDataMock = getPortalData as jest.MockedFunction<
  typeof getPortalData
>

test('renders the public stream without a membership check', async () => {
  const data = {} as PortalData
  getPortalDataMock.mockResolvedValue(data)

  const page = await StreamPage()

  expect(getPortalDataMock).toHaveBeenCalledWith('stream')
  expect(page.props).toMatchObject({ data, view: 'stream' })
})
