const path = require('path')
const buildEslintCommand = (filenames) =>
  `next lint --fix --file ${filenames
    .filter((f) => !f.includes('mock-archive'))
    .map((f) => path.relative(process.cwd(), f))
    .join(' --file ')}`

module.exports = {
  '*.{js,jsx,ts,tsx}': [
    buildEslintCommand,
    'prettier --ignore-path .gitignore --write',
  ],
}
