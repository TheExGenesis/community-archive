'use client'

import { Fragment, useState } from 'react'
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
}

export function AdminActionsMenu({ actions }: AdminActionsMenuProps) {
  const [selected, setSelected] = useState<AdminMenuAction | null>(null)
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
            <form action={selected.action}>
              {selected.hiddenInputs.map((input) => (
                <input
                  key={input.name}
                  type="hidden"
                  name={input.name}
                  value={input.value}
                />
              ))}
              <DialogFooter className="mt-4 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={selected.destructive ? 'destructive' : 'default'}
                >
                  {selected.label}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
