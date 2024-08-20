import { Database } from '../database-types'

const isProduction = process.env.NODE_ENV === 'production'

type TableName = keyof Database['public']['Tables']
type DevTableName = `dev_${TableName}`
type AllTableNames = TableName | DevTableName

export const getTableName = <T extends TableName>(
  baseName: T,
): T | `dev_${T}` =>
  (isProduction ? baseName : `dev_${baseName}`) as T | `dev_${T}`
