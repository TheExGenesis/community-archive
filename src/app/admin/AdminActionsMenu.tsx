'use client'

import { Fragment, useState, useTransition } from 'react'
import { AlertCircle, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type HiddenInput = {
  name: string
  value: string
}

export type AdminMenuAction = {
  id: string
  label: string
  title: string
  description: string
  action: (formData: FormData) => void | Promise<void>
  hiddenInputs: HiddenInput[]
  consequences?: string[]
  disabled?: boolean
  destructive?: boolean
  irreversible?: boolean
  separatorBefore?: boolean
}

type AdminActionsMenuProps = {
  actions: AdminMenuAction[]
  onActionComplete?: () => void | Promise<void>
}

export function AdminActionsMenu({
  actions,
  onActionComplete,
}: AdminActionsMenuProps) {
  const [selected, setSelected] = useState<AdminMenuAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const open = selected !== null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <MoreHorizontal className="h-4 w-4" />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {actions.map((action) => (
            <Fragment key={action.id}>
              {action.separatorBefore ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                disabled={action.disabled}
                className={
                  action.destructive
                    ? 'text-destructive focus:text-destructive'
                    : undefined
                }
                onSelect={() => setSelected(action)}
              >
                {action.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => !nextOpen && setSelected(null)}
      >
        {selected ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selected.destructive ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : null}
                {selected.title}
              </DialogTitle>
              <DialogDescription>{selected.description}</DialogDescription>
            </DialogHeader>
            {selected.consequences?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {selected.consequences.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {selected.irreversible ? (
              <p className="text-sm font-medium text-destructive">
                This action is irreversible.
              </p>
            ) : null}
            {/* Client-side wrapper so we can: (a) await the server action,
                (b) surface errors inline instead of throwing into the route
                error boundary, (c) refresh the table after success.
                The server action's revalidatePath alone re-fetches the RSC
                payload, but AdminTable owns its row state and ignores fresh
                props — so without an explicit refresh, the user sees the
                dialog close and nothing else. */}
            <form
              action={(formData) => {
                const action = selected.action
                startTransition(async () => {
                  setError(null)
                  try {
                    await action(formData)
                    setSelected(null)
                    if (onActionComplete) await onActionComplete()
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Action failed',
                    )
                  }
                })
              }}
            >
              {selected.hiddenInputs.map((input) => (
                <input
                  key={input.name}
                  type="hidden"
                  name={input.name}
                  value={input.value}
                />
              ))}
              {error ? (
                <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100">
                  {error}
                </p>
              ) : null}
              <DialogFooter className="mt-4 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(null)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={selected.destructive ? 'destructive' : 'default'}
                  disabled={isPending}
                >
                  {isPending ? 'Working…' : selected.label}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
