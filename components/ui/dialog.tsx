"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#17251b]/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content className={cn("fixed inset-x-0 bottom-0 z-50 max-h-[90svh] overflow-y-auto rounded-t-3xl border border-border bg-background p-6 shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(94vw,470px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl", className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 grid size-10 place-items-center rounded-xl hover:bg-accent focus-visible:outline-2" aria-label="Zatvori"><X size={18} /></DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
