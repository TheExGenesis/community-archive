const path = require('path')

const buildEslintCommand = (filenames) => {
  const files = filenames
    .filter((f) => !f.includes('mock-archive'))
    .map((f) => path.relative(process.cwd(), f))
    .join(' --file ')
  return `next lint --fix ${files.length > 0 ? `--file ${files}` : ''}`
}

module.exports = {
  '*.{js,jsx,ts,tsx}': [
    buildEslintCommand,
    'prettier --ignore-path .gitignore --write',
  ],
}
