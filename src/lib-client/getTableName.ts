const isProduction = process.env.NODE_ENV === 'production'
// Helper function to get the correct table name based on environment
export const getTableName = (baseName: string) =>
  isProduction ? baseName : `dev_${baseName}`
