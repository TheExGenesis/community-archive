# design-sync notes (community-archive)

## Setup facts
- Not a published package: a Next.js app. The "design system" is the shadcn/Radix primitives in `src/components/ui/`. No dist, no Storybook, so the converter runs in synth-entry mode (`cfg.entry` points at a non-existent `src/components/ui/index.ts` only so the package root resolves to the repo; the `[NO_DIST]` lines are expected).
- Always build via `sh .design-sync/build.sh` (not bare `package-build.mjs`): Tailwind is JIT, so `.design-sync/.cache/ds.css` must be recompiled from `.design-sync/tailwind.config.js` (app content + previews + token safelist) BEFORE every converter build, or classes used only in previews are missing.
- Fonts: the app loads Manrope (body) and Petrona (h1/h2 via the globals.css base rule) through `next/font/google`. The sync ships them as a Google Fonts `@import` in `.design-sync/tailwind.input.css` (`[FONT_REMOTE]`, expected).
- `.design-sync/overrides/source-kit.mjs` (fork): excludes `area-chart.tsx` (app widget that fetches Supabase; pulled supabase-js and env-var names into the bundle) and maps each ui file to a picker group. A NEW ui file must be added to `GROUP_BY_FILE` or it lands in "general".
- Icons: `.design-sync/icons.ts` re-exports exactly the lucide-react icons the app imports (82 at first sync), merged onto the global via `extraEntries`. Regenerate the list when the app adopts new icons.
- Render check uses system Chrome: `export DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`; playwright is installed in `.ds-sync/` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
- Guidelines are disabled (`guidelinesGlob: []`): `docs/*.md` are engineering/ops docs, not design guidance.
- Internals excluded from cards (still on the global): Dialog/Sheet Portal+Overlay, DropdownMenuPortal, NavigationMenu Indicator+Viewport, Select ScrollUp/Down buttons, ChartStyle.

## Preview authoring conventions
- Import everything (components AND icons) from `'community-archive'`.
- Sub-part previews (CardHeader, DialogTitle, SelectItem...) are ONE export composing the full parent, so the sub-part is visibly in context. Sub-parts throw outside their Radix parent.
- Overlays render open via `open` / `defaultOpen` props; cards for them use `cardMode: single`.
- Fictional content only: no real people's handles or names. Community Archive domain copy (archives, tweets, likes, opt-in, API keys).
- Only use Tailwind classes that exist in the compiled CSS (`grep` `ds-bundle/_ds_bundle.css`), or the orchestrator must rebuild CSS.
- Wrap anything with Tooltip in `<TooltipProvider>` (the app does so per call site, there is no root provider).
- Open overlays: pass `onOpenAutoFocus={(e) => e.preventDefault()}` on Dialog/Sheet/Popover content, or Radix focuses the first control and the capture shows a focus ring or selected text. Trigger previews use `modal={false}` so the trigger stays visible beside the open content. Menus open with `defaultOpen modal={false}`, submenus with `<DropdownMenuSub open>`, tooltips with `open` inside `TooltipProvider`, static chart tooltips with `active` + `defaultIndex`.
- Charts: series need `isAnimationActive={false}`; previews may import recharts primitives directly.
- ScrollArea: pass `type="always"` or the scrollbar is invisible in static captures.
- NavigationMenu opens via `defaultValue`; the panel is absolutely positioned, so wrap open previews in a div with an inline `minHeight`.
- Alert in this app doesn't absolutely position a leading icon (unlike stock shadcn): put icon + text in a `flex gap-3` wrapper.
- Checking whether a class exists: use a fixed-string grep, e.g. `grep -cF '.w-\[380px\]' ds-bundle/_ds_bundle.css` (regex escapes miscount). Classes confirmed missing at first sync (previews use inline `style` instead): `-space-x-2`, `basis-1/2`, `basis-1/3`, `w-2/3`, `aspect-auto`, `cursor-help`, `decoration-dotted`.
- Calendar previews pin `month`/`selected` to March 2024 for deterministic renders; Avatar images use inline SVG data URIs (no network).

## Known render warns
- Review sheets give every cell the same height, so short inline components (badges, buttons) sit in a lot of whitespace. Cosmetic, sheet-only.
- Skeleton looks very faint on white: that's the real `bg-muted` token, not a bug.
- Select placeholder text renders in the normal foreground colour: component behaviour, left as is.
- DropdownMenuRadioItem's selected indicator is a hollow ring (`CircleIcon` from @radix-ui/react-icons): component behaviour.

## Re-sync risks (watch-list for the next run)
- **New ui files**: anything added to `src/components/ui/` ships automatically but lands in the "general" group with a floor card until it's added to `GROUP_BY_FILE` in the source-kit fork and given a preview. A new app widget there (like area-chart.tsx) must go in `EXCLUDED_FILES`, or app/data code leaks into the bundle. Check `grep -o supabase ds-bundle/_ds_bundle.js | wc -l` is 0.
- **Icon list is a snapshot**: `.design-sync/icons.ts` lists the 82 lucide icons the app used on 2026-10-20. New icons the app adopts are missing from designs until the list is regenerated.
- **Compiled CSS is a snapshot of the app's class vocabulary**: classes the app stops using drop out of the stylesheet on rebuild, which can silently unstyle designs that relied on them. The safelist in `.design-sync/tailwind.config.js` guards the token, spacing, type and width families only.
- **Fonts load from Google Fonts at runtime** (not shipped as files). If the app changes fonts in `src/app/layout.tsx`, update `.design-sync/tailwind.input.css`.
- **Tokens come from `src/app/globals.css`** via the Tailwind input import; token edits there flow through automatically. Values quoted in `conventions.md` (brand #1E9BCD) do not, so re-check that file when the palette changes.
- **Source-kit fork**: diff `.design-sync/overrides/source-kit.mjs` against the bundled `lib/source-kit.mjs` on each re-sync and merge upstream changes.
- **Verified with**: node 22.22, pnpm 9.7, tailwindcss 3.3.3, system Google Chrome for capture (no playwright-bundled chromium).
