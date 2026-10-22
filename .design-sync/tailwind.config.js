// design-sync: compiles the app's Tailwind theme into one static stylesheet for
// claude.ai/design. Content covers the whole app (its real class vocabulary) and
// the authored previews; the safelist guarantees every semantic token utility
// exists even if the app never used that exact combination.
const base = require('../tailwind.config.js')

const tokens = [
  'background', 'foreground', 'border', 'input', 'ring',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
  'muted', 'muted-foreground', 'accent', 'accent-foreground',
  'destructive', 'destructive-foreground', 'popover', 'popover-foreground',
  'card', 'card-foreground', 'brand', 'brand-foreground', 'brand-deep',
  'brand-deep-foreground', 'chart-accent', 'brand-icon', 'muted-cool',
  'table-header', 'border-cool',
].join('|')

module.exports = {
  ...base,
  content: [
    './src/**/*.{ts,tsx}',
    './.design-sync/previews/**/*.{ts,tsx}',
  ],
  safelist: [
    { pattern: new RegExp(`^(bg|text|border|ring|fill|stroke|outline|divide|from|to|via)-(${tokens})$`), variants: ['hover', 'dark', 'focus-visible'] },
    { pattern: /^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(0|0\.5|1|1\.5|2|2\.5|3|4|5|6|8|10|12|16|20|24)$/ },
    { pattern: /^(text)-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)$/ },
    { pattern: /^(w|h|min-w|min-h)-(4|5|6|8|10|12|16|20|24|32|40|48|56|64|72|80|96|full|screen|fit)$/ },
    { pattern: /^max-w-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|full|prose)$/ },
    { pattern: /^(font)-(normal|medium|semibold|bold)$/ },
    { pattern: /^(rounded)-(none|sm|md|lg|xl|2xl|full)$/ },
    { pattern: /^(grid-cols)-(1|2|3|4|6|12)$/, variants: ['sm', 'md', 'lg'] },
    { pattern: /^(flex|grid|block|inline-flex|hidden|items-center|items-start|items-end|justify-between|justify-center|justify-end|flex-col|flex-row|flex-wrap|flex-1|shrink-0|w-full|h-full|min-w-0|truncate|shadow|shadow-sm|shadow-md|border|border-t|border-b)$/ },
  ],
}
