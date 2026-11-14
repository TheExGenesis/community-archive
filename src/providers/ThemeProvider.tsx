'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ThemeProviderProps } from 'next-themes/dist/types'

// Pages drawn for a dark canvas only. The whole site chrome (header, footer)
// follows while the visitor is there; their own preference is kept and
// returns on the next page.
const DARK_ONLY_PATHS = ['/spread-explorer']

export const isDarkOnlyPath = (pathname: string | null) =>
  !!pathname &&
  DARK_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  const forcedTheme = isDarkOnlyPath(usePathname()) ? 'dark' : undefined
  return (
    <NextThemesProvider {...props} forcedTheme={forcedTheme}>
      {children}
    </NextThemesProvider>
  )
}

export default ThemeProvider
