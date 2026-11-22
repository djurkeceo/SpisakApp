"use client";
import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return <Menu.Portal><Menu.Content sideOffset={sideOffset} className={cn("z-40 min-w-44 rounded-xl border border-border bg-background p-1 shadow-lg", className)} {...props} /></Menu.Portal>;
}
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none focus:bg-accent [&_svg]:size-4", className)} {...props} />;
}
