"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";

export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />;
}

export function PopoverTrigger(
  props: ComponentProps<typeof PopoverPrimitive.Trigger>
) {
  return <PopoverPrimitive.Trigger {...props} />;
}

export function PopoverContent({
  className = "",
  align = "start",
  sideOffset = 6,
  portalContainer,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content> & {
  portalContainer?: HTMLElement | null;
}) {
  return (
    <PopoverPrimitive.Portal container={portalContainer}>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={`z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg outline-none ${className}`}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
