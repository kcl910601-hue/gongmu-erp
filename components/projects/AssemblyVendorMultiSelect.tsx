"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

type VendorOption = { id: number; name: string };

type Props = {
  options: VendorOption[];
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
};

export function AssemblyVendorMultiSelect({ options, value, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");
  const selected = useMemo(
    () => value.flatMap((id) => {
      const option = options.find((candidate) => candidate.id === id);
      return option ? [option] : [];
    }),
    [options, value]
  );
  const filtered = options.filter((option) => option.name.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR")));

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((candidate) => candidate !== id) : [...value, id]);
  }

  return <div className="mt-1 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
    <div className="flex min-h-8 flex-wrap gap-1.5">
      {selected.map((vendor, index) => <span key={vendor.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
        {vendor.name}{index === 0 && <span className="text-[10px] text-blue-500">Primary</span>}
        <button type="button" disabled={disabled} onClick={() => toggle(vendor.id)} aria-label={`${vendor.name} 제거`}><X size={12} /></button>
      </span>)}
      {selected.length === 0 && <span className="px-1 py-1 text-xs font-normal text-slate-400">조립업체를 선택하세요.</span>}
    </div>
    <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
      <Search size={14} className="text-slate-400" />
      <input disabled={disabled} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="업체 검색" className="min-w-0 flex-1 text-sm font-normal outline-none" />
    </div>
    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-1">
      {filtered.map((vendor) => <label key={vendor.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-white">
        <input type="checkbox" disabled={disabled} checked={value.includes(vendor.id)} onChange={() => toggle(vendor.id)} className="h-4 w-4 rounded border-slate-300" />
        {vendor.name}
      </label>)}
      {filtered.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">일치하는 업체가 없습니다.</p>}
    </div>
  </div>;
}
