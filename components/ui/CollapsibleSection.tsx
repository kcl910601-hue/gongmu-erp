"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type CollapsibleSectionProps = {
  id: string;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function CollapsibleSection({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const contentId = `${id}-content`;

  return (
    <section id={id} className="mb-6 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2 px-5 py-4 text-left transition-colors hover:bg-slate-50"
      >
        {open ? <ChevronDown size={18} className="shrink-0 text-slate-500" /> : <ChevronRight size={18} className="shrink-0 text-slate-500" />}
        <span className="text-lg font-bold tracking-tight text-slate-950">{title}</span>
        {count !== undefined && <span className="text-sm font-semibold text-slate-400">({count})</span>}
      </button>
      <div
        id={contentId}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-slate-100 px-5 pb-5 pt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
