/** @jest-environment node */
import fs from 'fs'
import path from 'path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'

const config = require('../../tailwind.config')

test('compiles a dark background for the extension reminder', async () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'ExtensionInstallPrompt.tsx'),
    'utf8',
  )
  const result = await postcss([
    tailwindcss({ ...config, content: [{ raw: source, extension: 'tsx' }] }),
  ]).process('@tailwind utilities;', { from: undefined })
  const darkBackgrounds: string[] = []
  result.root.walkRules((rule) => {
    if (rule.selector.includes('.dark') && rule.selector.includes('bg-')) {
      rule.walkDecls('background-color', (declaration) => {
        darkBackgrounds.push(declaration.value)
      })
    }
  })
  expect(darkBackgrounds).toContain('rgb(18 18 20 / 0.85)')
})
