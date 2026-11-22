"use client";
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root data-slot="checkbox" className={cn("grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50", className)} {...props}>
      <CheckboxPrimitive.Indicator className="text-primary-foreground"><Check size={16} strokeWidth={2.8} /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
