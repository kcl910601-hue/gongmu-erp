"use client";

import { Check, Copy } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";

type ExpandableMemoProps = {
  text: string;
  header: ReactNode;
  actions?: ReactNode;
};

export function ExpandableMemo({ text, header, actions }: ExpandableMemoProps) {
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || isExpanded) return;
    const updateOverflow = () => setIsOverflowing(content.scrollHeight > content.clientHeight + 1);
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(content);
    return () => observer.disconnect();
  }, [isExpanded, text]);

  async function copyMemo() {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1600);
    } catch {
      toast.error("메모를 복사하지 못했습니다.");
    }
  }

  return <div>
    <div className="flex items-start justify-between gap-2">
      {header}
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" aria-label="메모 복사" title={isCopied ? "복사됨" : "메모 복사"} onClick={(event) => { event.stopPropagation(); void copyMemo(); }} className="inline-flex min-h-7 items-center gap-1 rounded-lg px-1.5 text-[10px] font-semibold text-slate-400 transition-colors hover:bg-white hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100">{isCopied ? <Check size={13}/> : <Copy size={13}/>}<span>{isCopied ? "복사됨" : "복사"}</span></button>
        {actions}
      </div>
    </div>
    <p ref={contentRef} className={`mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700 [overflow-wrap:anywhere] ${isExpanded ? "max-h-[300px] overflow-y-auto pr-1" : "line-clamp-4 overflow-hidden"}`}>{text}</p>
    {(isOverflowing || isExpanded) && <button type="button" onClick={(event) => { event.stopPropagation(); setIsExpanded((current) => !current); }} className="mt-2 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100">{isExpanded ? "접기" : "더보기"}</button>}
  </div>;
}
