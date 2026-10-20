"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ShipmentSchedulePreview } from "./ShipmentSchedulePreview";
import { getShipmentMonthRange, validateShipmentScheduleRange, type ShipmentScheduleDocument, type ShipmentScheduleItem } from "@/lib/shipment-schedule-pdf";

type Props = {
  document: ShipmentScheduleDocument;
  allItems: ShipmentScheduleItem[];
  onChange: (items: ShipmentScheduleItem[]) => void;
  onEditing: () => void;
};

const fieldClass = "mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm";

export function ShipmentScheduleEditor({ document, allItems, onChange, onEditing }: Props) {
  const [editing, setEditing] = useState<ShipmentScheduleItem | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isEditing = editing !== null;
  const range = document.range ?? getShipmentMonthRange(document.month)!;

  useEffect(() => {
    if (!isEditing) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      window.document.body.style.overflow = previousOverflow;
    };
  }, [isEditing]);

  function add(date: string) {
    onEditing();
    setError("");
    setEditing({ id: Math.min(0, ...allItems.map((item) => item.id)) - 1, shipmentDate: date, projectName: "", taskName: "출고", quantity: null, quantityUnit: "EA", memo: "", status: "pending", processName: "", shipmentLabel: "" });
  }

  function edit(id: number) {
    const item = allItems.find((candidate) => candidate.id === id);
    if (item) { onEditing(); setError(""); setEditing({ ...item }); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    if (!editing.projectName.trim() || !editing.taskName.trim()) { setError("현장명과 작업명을 입력해 주세요."); return; }
    if (validateShipmentScheduleRange({ start: editing.shipmentDate, end: editing.shipmentDate }) || editing.shipmentDate < range.start || editing.shipmentDate > range.end) { setError("출력 기간 안의 날짜를 선택해 주세요."); return; }
    if (editing.quantity !== null && (!Number.isFinite(editing.quantity) || editing.quantity < 0)) { setError("수량은 0 이상의 숫자로 입력해 주세요."); return; }
    const saved = { ...editing, clientName: editing.clientName?.trim() || null, projectName: editing.projectName.trim(), taskName: editing.taskName.trim(), quantityUnit: editing.quantityUnit?.trim() || null, processName: editing.processName?.trim() || "", shipmentLabel: editing.shipmentLabel?.trim() || "", memo: editing.memo?.trim() || null };
    onChange(allItems.some((item) => item.id === saved.id) ? allItems.map((item) => item.id === saved.id ? saved : item) : [...allItems, saved]);
    setEditing(null);
  }

  const excluded = allItems.filter((item) => item.excluded);
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{document.vendorName} · 출력 {document.items.length}건</h2><Button variant="outline" onClick={() => add(range.start)} disabled={Boolean(editing)}>출력용 일정 추가</Button></div>
    {editing && <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={() => setEditing(null)} className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
      <form data-schedule-editor onSubmit={save} className="p-5">
      <div className="flex items-center justify-between gap-3"><h3 id={titleId} className="font-semibold">출력용 일정 편집</h3><Button variant="ghost" aria-label="편집창 닫기" onClick={() => setEditing(null)}>닫기</Button></div>
      <p className="mt-1 text-sm text-slate-600">원본 프로젝트에 반영되지 않습니다. 저장한 뒤 PDF를 생성해 주세요.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">출고일<input required type="date" min={range.start} max={range.end} value={editing.shipmentDate} onChange={(event) => setEditing({ ...editing, shipmentDate: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm">현장명<input required value={editing.projectName} onChange={(event) => setEditing({ ...editing, projectName: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm">발주처<input value={editing.clientName || ""} onChange={(event) => setEditing({ ...editing, clientName: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm">작업명<input required value={editing.taskName} onChange={(event) => setEditing({ ...editing, taskName: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm">공정<input value={editing.processName || ""} onChange={(event) => setEditing({ ...editing, processName: event.target.value, shipmentLabel: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm">수량<input type="number" min="0" step="any" value={editing.quantity ?? ""} onChange={(event) => setEditing({ ...editing, quantity: event.target.value === "" ? null : Number(event.target.value) })} className={fieldClass} /></label>
        <label className="text-sm">단위<input value={editing.quantityUnit || ""} onChange={(event) => setEditing({ ...editing, quantityUnit: event.target.value })} className={fieldClass} /></label>
      </div>
      <label className="mt-3 block text-sm">전달사항 / 비고<textarea rows={3} value={editing.memo || ""} onChange={(event) => setEditing({ ...editing, memo: event.target.value })} className={fieldClass} /></label>
      {Boolean(editing.notes?.length) && <label className="mt-3 block text-sm">업무 메모 가져오기<select value="" className={fieldClass} onChange={(event) => {
        const note = editing.notes?.find((item) => item.id === event.target.value);
        if (note) setEditing({ ...editing, memo: [editing.memo, note.text].filter(Boolean).join("\n") });
      }}><option value="">출력에 포함할 메모 선택</option>{editing.notes?.map((note) => <option key={note.id} value={note.id}>{note.text}</option>)}</select></label>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><Button type="submit" variant="primary">출력물에 적용</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>취소</Button>
        {allItems.some((item) => item.id === editing.id) && <Button type="button" variant="outline" onClick={() => {
          onChange(editing.id < 0 ? allItems.filter((item) => item.id !== editing.id) : allItems.map((item) => item.id === editing.id ? { ...item, excluded: true } : item));
          setEditing(null);
        }}>{editing.id < 0 ? "추가 일정 삭제" : "출력 제외"}</Button>}
      </div>
    </form></dialog>}
    {excluded.length > 0 && <details className="rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm">출력 제외 {excluded.length}건 · 복원</summary><ul className="mt-2 space-y-2">{excluded.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 text-sm"><span>{item.shipmentDate} · {item.projectName} · {item.taskName}</span><Button variant="outline" onClick={() => onChange(allItems.map((candidate) => candidate.id === item.id ? { ...candidate, excluded: false } : candidate))}>복원</Button></li>)}</ul></details>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-4"><ShipmentSchedulePreview {...document} onAdd={add} onEdit={edit} /></div>
  </section>;
}
