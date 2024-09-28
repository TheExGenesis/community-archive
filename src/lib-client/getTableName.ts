import { Database } from '../database-types'

const isProduction = process.env.NODE_ENV === 'production'

export type TableName =
  | keyof Database['public']['Tables']
  | keyof Database['dev']['Tables']

export const getTableName = <T extends TableName>(baseName: T): T => baseName

export const getSchemaName = (): 'public' | 'dev' => {
  if (isProduction || process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'false') {
    return 'public'
  } else {
    return 'dev'
  }
}
