# Community Archive UI: how to build with it

These are the Community Archive web app's own shadcn/ui primitives (Radix under the hood), styled with Tailwind and the app's CSS-variable tokens. Every component and the app's lucide icons live on `window.CommunityArchiveUI`.

## Setup
- Link `styles.css` once. It carries the tokens, the compiled Tailwind utilities, and the fonts (Manrope for body, Petrona for `h1`/`h2`, loaded from Google Fonts).
- There is no root provider. A few compounds need their parent:
  - Tooltips need `<TooltipProvider>` around `<Tooltip>`.
  - Every sub-part (`DialogContent`, `SelectItem`, `TabsTrigger`, `RadioGroupItem`, `DropdownMenuItem`...) throws outside its root. Always compose the full family.
- Compounds are flat named exports, not dotted: use `DialogHeader`, not `Dialog.Header`.
- Dark mode: put `className="dark"` on an ancestor. Tokens flip automatically. Don't hand-pick dark colors.

## Styling idiom: Tailwind utilities over semantic tokens
Style your own layout with Tailwind classes, and use the token names, never raw hex. The stylesheet is precompiled, so only classes it contains work:
- every token utility below;
- the standard spacing scale (`p-4`, `gap-3`, `space-y-2`...);
- the type scale (`text-xs`...`text-5xl`), `font-medium`/`font-semibold`/`font-bold`;
- `rounded-sm/md/lg/xl/full`, and flex/grid basics;
- the classes the app itself uses.

Avoid arbitrary values like `w-[437px]`. Use standard widths (`w-64`...`w-96`, `max-w-sm`...`max-w-6xl`) or an inline `style` for one-off sizes.

| Role | Classes |
|---|---|
| Page / raised surfaces | `bg-background`, `bg-card`, `bg-popover`, `bg-muted` |
| Text | `text-foreground`, `text-muted-foreground`, `text-card-foreground` |
| Actions | `bg-primary text-primary-foreground`, `bg-secondary`, `bg-accent`, `bg-destructive text-destructive-foreground` |
| Brand accent (#1E9BCD) | `bg-brand text-brand-foreground`, `text-brand`, tints like `bg-brand/10` |
| Deep brand: banners and callouts only, never body text | `bg-brand-deep text-brand-deep-foreground` |
| Icons, charts | `text-brand-icon`, `text-chart-accent` |
| Data-table chrome | `bg-table-header`, `border-border-cool`, `text-muted-cool` |
| Lines and radius | `border-border`, `border-input`, `ring-ring`, `rounded-lg` (= `--radius`) |
| Loading shimmer | `bg-shimmer animate-shimmer` |

Links inherit color and read as links by weight (`font-weight: 600`). Card titles are Manrope, and only `h1`/`h2` are serif.

## Where the truth lives
- `styles.css`, then `_ds_bundle.css`: the real token values (`--brand`, `--muted-cool`...) and every available class.
- `components/<group>/<Name>/<Name>.prompt.md`: the examples to imitate. `<Name>.d.ts` is the props contract. Button variants are `default | secondary | outline | ghost | destructive | link` and sizes `sm | default | lg | icon`. Badge variants are `default | secondary | destructive | outline`.

## Example
```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Badge, Download } = window.CommunityArchiveUI;

<Card className="w-96">
  <CardHeader className="flex flex-row items-start justify-between space-y-0">
    <div className="space-y-1.5">
      <CardTitle className="text-lg">@marginalia_fan</CardTitle>
      <CardDescription>Archive uploaded March 2024</CardDescription>
    </div>
    <Badge variant="secondary">Public</Badge>
  </CardHeader>
  <CardContent className="grid grid-cols-3 gap-4 text-sm">
    <div><div className="font-semibold">412k</div><div className="text-muted-foreground">Tweets</div></div>
    <div><div className="font-semibold">38k</div><div className="text-muted-foreground">Likes</div></div>
    <div><div className="font-semibold">2.1k</div><div className="text-muted-foreground">Following</div></div>
  </CardContent>
  <CardFooter>
    <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Download JSON</Button>
  </CardFooter>
</Card>
```
