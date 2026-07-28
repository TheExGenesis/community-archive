import { requireClickHouseLab } from '@/lib/clickhouseLab'
import ClickHouseLabClient from './ClickHouseLabClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'ClickHouse lab | Community Archive',
  description: 'Staging-only analytical views powered by ClickHouse.',
}

export default async function ClickHouseLabPage() {
  await requireClickHouseLab()
  return <ClickHouseLabClient />
}
