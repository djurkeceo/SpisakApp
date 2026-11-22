import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn("h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", className)} {...props} />;
}
