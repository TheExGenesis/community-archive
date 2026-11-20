'use client'

/** The settings page's switch, shared by the alert controls. */
export function ToggleSwitch({
  checked,
  label,
  disabled,
  onChange,
  size = 'md',
}: {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (next: boolean) => void
  size?: 'sm' | 'md'
}) {
  const small = size === 'sm'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 ${
        small ? 'h-5 w-9' : 'h-6 w-11'
      } ${checked ? 'bg-brand' : 'bg-zinc-300 dark:bg-zinc-700'}`}
    >
      <span
        aria-hidden
        className={`inline-block rounded-full bg-white shadow transition-transform ${
          small ? 'h-4 w-4' : 'h-5 w-5'
        } ${
          checked
            ? small
              ? 'translate-x-[18px]'
              : 'translate-x-5'
            : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
