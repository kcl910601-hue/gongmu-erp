"use client";

import type { ComponentProps } from "react";
import { DayPicker } from "react-day-picker";

export function Calendar({
  className = "",
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={`relative p-1 text-sm text-slate-700 ${className}`}
      classNames={{
        months: "flex flex-col",
        month: "space-y-3",
        month_caption: "flex h-9 items-center justify-center px-9",
        caption_label: "text-sm font-semibold",
        dropdowns: "flex items-center gap-1",
        dropdown:
          "rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-400",
        nav: "absolute inset-x-1 top-1 flex items-center justify-between",
        button_previous:
          "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100",
        button_next:
          "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 py-1 text-center text-xs font-medium text-slate-400",
        week: "mt-1 flex w-full",
        day: "relative h-9 w-9 p-0 text-center",
        day_button:
          "h-9 w-9 rounded-lg text-sm transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200",
        selected:
          "[&>button]:bg-blue-600 [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-blue-700",
        today:
          "[&>button]:border [&>button]:border-blue-300 [&>button]:font-semibold [&>button]:text-blue-700",
        outside: "text-slate-300 opacity-60",
        disabled: "text-slate-300 opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
