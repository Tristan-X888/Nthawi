"use client"

import { Dialog } from "@base-ui/react/dialog"
import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/*
 * Edge drawer (mobile navigation, small editors). Base UI Dialog supplies the
 * focus trap, Escape to close, scroll lock, inert background and focus return.
 */

const Sheet = Dialog.Root
const SheetTrigger = Dialog.Trigger
const SheetClose = Dialog.Close

function SheetContent({
  side = "start",
  className,
  children,
  ...props
}: Dialog.Popup.Props & { side?: "start" | "end" }) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <Dialog.Popup
        className={cn(
          "fixed inset-y-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-background text-foreground shadow-xl transition-transform duration-200 ease-standard outline-none",
          side === "start"
            ? "inset-s-0 data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full"
            : "inset-e-0 data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
          className
        )}
        {...props}
      >
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  )
}

function SheetTitle({ className, ...props }: Dialog.Title.Props) {
  return <Dialog.Title className={cn("text-lg font-semibold", className)} {...props} />
}

function SheetDescription({ className, ...props }: Dialog.Description.Props) {
  return (
    <Dialog.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export type SheetProps = React.ComponentProps<typeof Dialog.Root>

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
}
