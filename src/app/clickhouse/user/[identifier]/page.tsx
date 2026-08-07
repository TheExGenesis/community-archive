import { requireClickHouseLab } from '@/lib/clickhouseLab'
import ClickHouseUserClient from './ClickHouseUserClient'

export const dynamic = 'force-dynamic'

export default async function ClickHouseUserPage({
  params,
}: {
  params: { identifier: string }
}) {
  await requireClickHouseLab()
  return <ClickHouseUserClient identifier={params.identifier} />
}
