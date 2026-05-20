'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type HiddenInput = {
  name: string
  value: string
}

type AdminConfirmActionProps = {
  action: (formData: FormData) => void | Promise<void>
  buttonLabel: string
  confirmLabel: string
  title: string
  description: string
  hiddenInputs: HiddenInput[]
  consequences: string[]
  disabled?: boolean
  irreversible?: boolean
}

export function AdminConfirmAction({
  action,
  buttonLabel,
  confirmLabel,
  title,
  description,
  hiddenInputs,
  consequences,
  disabled = false,
  irreversible = true,
}: AdminConfirmActionProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {consequences.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {irreversible ? (
            <p className="text-sm font-medium text-destructive">
              This action is irreversible.
            </p>
          ) : null}
          <form action={action}>
            {hiddenInputs.map((input) => (
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
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive">
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
