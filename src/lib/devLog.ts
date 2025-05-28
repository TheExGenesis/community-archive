const isDevelopment = process.env.NODE_ENV !== 'production'

export const devLog = (...args: any[]): void => {
  if (isDevelopment) {
    console.log(...args)
  }
}

export const devWarn = (...args: any[]): void => {
  if (isDevelopment) {
    console.warn(...args)
  }
}

export const devError = (...args: any[]): void => {
  if (isDevelopment) {
    console.error(...args)
  }
}
