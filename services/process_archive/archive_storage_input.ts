import { createHash } from 'node:crypto'
import type { ArchiveClickHouseDelivery } from './archive_clickhouse'

export function parseArchiveInput(
  text: string,
  reference?: Partial<ArchiveClickHouseDelivery>,
): any {
  if (
    reference?.storage_sha256 &&
    createHash('sha256').update(text, 'utf8').digest('hex') !==
      reference.storage_sha256
  ) {
    throw new Error('Archive checksum mismatch')
  }
  const archive = JSON.parse(text)
  if (
    reference?.account_id &&
    archive.account?.[0]?.account?.accountId !== reference.account_id
  ) {
    throw new Error('Archive owner does not match the upload record')
  }
  return archive
}
