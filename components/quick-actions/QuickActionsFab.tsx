"use client";

import {
  ClipboardPlus,
  FileUp,
  FolderPlus,
  Plus,
  StickyNote,
  Truck,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { logActivity } from "@/lib/activity";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { QuickCreateInitialView } from "@/components/quick-create/QuickCreate";

type ProjectOption = {
  id: number;
  project_name: string;
  project_code: string | null;
};

type FabDialog = "shipment" | "memo" | null;

const initialShipmentForm = {
  projectId: "",
  siteName: "",
  itemName: "",
  quantity: "",
  shipmentDate: "",
  memo: "",
};

function dispatchQuickCreate(
  view: QuickCreateInitialView,
  projectId: number | null
) {
  window.dispatchEvent(
    new CustomEvent("quick-create:open", {
      detail: { view, projectId },
    })
  );
}

export default function QuickActionsFab() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [dialog, setDialog] = useState<FabDialog>(null);
  const [currentEmployee, setCurrentEmployee] =
    useState<CurrentEmployee | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [shipmentForm, setShipmentForm] = useState(initialShipmentForm);
  const [memo, setMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const contextProjectId = useMemo(() => {
    const match = pathname.match(/^\/projects\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [pathname]);

  const canUseQuickActions = Boolean(
    currentEmployee && currentEmployee.active !== false
  );
  const canCreateProject =
    currentEmployee?.role === "admin" || currentEmployee?.role === "manager";

  const closeAll = useCallback(() => {
    setIsOpen(false);
    setDialog(null);
    setErrorMessage("");
  }, []);

  useEffect(() => {
    void getCurrentEmployee().then(setCurrentEmployee);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setIsOpen((current) => !current);
        return;
      }

      if (event.key === "Escape") closeAll();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeAll]);

  useEffect(() => {
    if (dialog !== "shipment") return;

    let isMounted = true;

    async function loadProjects() {
      const { data, error } = await supabase
        .from("projects")
        .select("id, project_name, project_code")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!isMounted) return;
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setProjects((data ?? []) as ProjectOption[]);
      if (contextProjectId) {
        setShipmentForm((current) => ({
          ...current,
          projectId: String(contextProjectId),
        }));
      }
    }

    void loadProjects();
    return () => {
      isMounted = false;
    };
  }, [contextProjectId, dialog]);

  function openQuickCreate(view: QuickCreateInitialView) {
    dispatchQuickCreate(view, contextProjectId);
    setIsOpen(false);
  }

  async function createShipment() {
    if (!shipmentForm.siteName.trim() || !shipmentForm.itemName.trim()) {
      setErrorMessage("현장명과 품목을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const projectId = shipmentForm.projectId
      ? Number(shipmentForm.projectId)
      : null;
    const { data, error } = await supabase
      .from("shipments")
      .insert({
        project_id: projectId,
        task_id: null,
        site_name: shipmentForm.siteName.trim(),
        item_name: shipmentForm.itemName.trim(),
        quantity: shipmentForm.quantity ? Number(shipmentForm.quantity) : null,
        shipment_date: shipmentForm.shipmentDate || null,
        memo: shipmentForm.memo.trim() || null,
        status: "출고대기",
      })
      .select("id")
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    await logActivity({
      type: "shipment_create",
      title: "출고 생성",
      description: `${shipmentForm.siteName.trim()} ${shipmentForm.itemName.trim()} 출고를 생성했습니다.`,
      projectId,
      targetType: "shipment",
      targetId: data.id,
    });

    setShipmentForm(initialShipmentForm);
    setIsSaving(false);
    closeAll();
  }

  function saveMemo() {
    const trimmedMemo = memo.trim();
    if (!trimmedMemo) {
      setErrorMessage("메모 내용을 입력하세요.");
      return;
    }

    let storedMemos: unknown[] = [];
    try {
      const storedValue = JSON.parse(
        localStorage.getItem("quick-memos") || "[]"
      ) as unknown;
      if (Array.isArray(storedValue)) storedMemos = storedValue;
    } catch {
      storedMemos = [];
    }
    localStorage.setItem(
      "quick-memos",
      JSON.stringify([
        {
          id: crypto.randomUUID(),
          content: trimmedMemo,
          projectId: contextProjectId,
          createdAt: new Date().toISOString(),
        },
        ...storedMemos,
      ])
    );
    setMemo("");
    closeAll();
  }

  if (!canUseQuickActions) return null;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
        <div
          className={`origin-bottom-right transition-all duration-200 ${
            isOpen
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-2 scale-95 opacity-0"
          }`}
        >
          <div className="min-w-48 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
            {canCreateProject && (
              <ActionButton
                label="새 프로젝트"
                icon={FolderPlus}
                onClick={() => openQuickCreate("project")}
              />
            )}
            <ActionButton
              label="새 업무"
              icon={ClipboardPlus}
              onClick={() => openQuickCreate("task")}
            />
            <ActionButton
              label="출고 등록"
              icon={Truck}
              onClick={() => {
                setDialog("shipment");
                setIsOpen(false);
              }}
            />
            <ActionButton
              label="파일 업로드"
              icon={FileUp}
              onClick={() => openQuickCreate("file")}
            />
            <ActionButton
              label="메모 작성"
              icon={StickyNote}
              onClick={() => {
                setDialog("memo");
                setIsOpen(false);
              }}
            />
          </div>
        </div>

        <button
          type="button"
          role="button"
          tabIndex={0}
          aria-label={isOpen ? "빠른 작업 닫기" : "빠른 작업 열기"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          <Plus
            size={24}
            className={`transition-transform duration-200 ${
              isOpen ? "rotate-45" : "rotate-0"
            }`}
          />
        </button>
      </div>

      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4"
          onMouseDown={closeAll}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={dialog === "shipment" ? "출고 등록" : "메모 작성"}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-950">
                {dialog === "shipment" ? "출고 등록" : "빠른 메모"}
              </h2>
              <button
                type="button"
                onClick={closeAll}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            {dialog === "shipment" ? (
              <div className="space-y-3">
                <select
                  value={shipmentForm.projectId}
                  onChange={(event) =>
                    setShipmentForm({
                      ...shipmentForm,
                      projectId: event.target.value,
                    })
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                >
                  <option value="">프로젝트 없음</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.project_name} · {project.project_code || "코드 없음"}
                    </option>
                  ))}
                </select>
                <QuickInput
                  placeholder="현장명"
                  value={shipmentForm.siteName}
                  onChange={(siteName) =>
                    setShipmentForm({ ...shipmentForm, siteName })
                  }
                />
                <QuickInput
                  placeholder="품목"
                  value={shipmentForm.itemName}
                  onChange={(itemName) =>
                    setShipmentForm({ ...shipmentForm, itemName })
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <QuickInput
                    placeholder="수량"
                    type="number"
                    value={shipmentForm.quantity}
                    onChange={(quantity) =>
                      setShipmentForm({ ...shipmentForm, quantity })
                    }
                  />
                  <QuickInput
                    placeholder="출고 예정일"
                    type="date"
                    value={shipmentForm.shipmentDate}
                    onChange={(shipmentDate) =>
                      setShipmentForm({ ...shipmentForm, shipmentDate })
                    }
                  />
                </div>
                <textarea
                  value={shipmentForm.memo}
                  onChange={(event) =>
                    setShipmentForm({
                      ...shipmentForm,
                      memo: event.target.value,
                    })
                  }
                  rows={3}
                  placeholder="비고"
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <textarea
                autoFocus
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                rows={6}
                placeholder="빠르게 기록할 내용을 입력하세요."
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            )}

            {errorMessage && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAll}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() =>
                  dialog === "shipment" ? void createShipment() : saveMemo()
                }
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Plus;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
    >
      <Icon size={17} className="text-slate-500" />
      {label}
    </button>
  );
}

function QuickInput({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date";
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
    />
  );
}
