import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from 'community-archive'

const steps = [
  'Request your data export from Twitter settings.',
  'Wait for the email (usually 24 hours) and download the zip.',
  'Drop the zip on the upload page. Private files are removed in your browser.',
  'Choose whether your archive is public, then upload.',
]

export const InContext = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="right">
      <SheetHeader>
        <SheetTitle>How uploading works</SheetTitle>
        <SheetDescription>Four steps, about five minutes of your time.</SheetDescription>
      </SheetHeader>
      <ol className="mt-6 space-y-4 text-sm">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </SheetContent>
  </Sheet>
)
