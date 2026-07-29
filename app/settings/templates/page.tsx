"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePermission } from "@/hooks/usePermission";
import { getActiveProcessTypes, normalizeProcessTypeCode } from "@/lib/process-types";
import { manageSettingsItem } from "@/lib/settings-deletion";
import { toast } from "@/lib/toast";

type TaskTemplate = {
  id: number;
  process_type: string;
  task_order: number | null;
  task_name: string | null;
  task_type: string | null;
  created_at: string | null;
};

export default function SettingsPage() {
  const [selectedProcess, setSelectedProcess] = useState("");
  const [processes, setProcesses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState("발주");
  const [taskOrder, setTaskOrder] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { role } = usePermission();
  const canDelete = role === "admin";

  const loadTemplates = useCallback(async function loadTemplates() {
    if (!selectedProcess) {
      setTemplates([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const { data, error } = await supabase
      .from("task_templates")
      .select("*")
      .eq("process_type", selectedProcess)
      .order("task_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      alert(error.message);
      setIsLoading(false);
      return;
    }

    setTemplates(data || []);
    setIsLoading(false);
    setTaskOrder((data?.length || 0) + 1);
  }, [selectedProcess]);

  useEffect(() => {
    void getActiveProcessTypes().then((result) => {
      if (result.error) {
        alert(result.error.message);
        setIsLoading(false);
        return;
      }
      setProcesses(result.data);
      setSelectedProcess((current) => current || result.data[0]?.code || "");
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTemplates();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTemplates]);

  async function addTemplate() {
  if (isSaving) return;

  if (!taskName.trim()) {
    alert("업무명을 입력하세요.");
    return;
  }

  setIsSaving(true);

  const { error } = await supabase
    .from("task_templates")
    .insert([
      {
        process_type: normalizeProcessTypeCode(selectedProcess),
        task_order: taskOrder,
        task_name: taskName.trim(),
        task_type: taskType,
      },
    ]);

    setIsSaving(false);

    if (error) {
    alert(error.message);
    return;
    }

   setTaskName("");

    loadTemplates();
  }

  async function prepareDelete(template: TaskTemplate) {
    if (!canDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await manageSettingsItem("task_template", template.id, false);
      if (!result.success || result.action === "blocked") {
        toast.error(result.message);
        return;
      }
      setDeleteTarget(template);
    } catch (error) {
      console.error("task template delete inspection error:", error);
      toast.error("삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return;
    const target = deleteTarget;
    setIsDeleting(true);
    try {
      const result = await manageSettingsItem("task_template", target.id, true);
      if (!result.success || result.action !== "deleted") {
        toast.error(result.message || "삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      setTemplates((current) => current.filter((template) => template.id !== target.id));
      toast.success(`"${target.task_name || "업무 템플릿"}"이 삭제되었습니다.`);
      setDeleteTarget(null);
    } catch (error) {
      console.error("task template delete error:", error);
      toast.error("삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              업무 템플릿 관리
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              프로젝트 생성 시 자동으로 만들어질 업무 목록입니다.
            </p>
          </div>

          <select
            value={selectedProcess}
            onChange={(e) => setSelectedProcess(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-blue-500"
          >
            {processes.map((process) => (
              <option key={process.id} value={process.code}>
                {process.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">
            {selectedProcess} 업무 목록
          </h3>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
            총 {templates.length}개
          </span>
        </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
  <h3 className="mb-4 text-lg font-bold">
    새 업무 추가
  </h3>

  <div className="grid grid-cols-4 gap-3">

    <input
      className="rounded-xl border p-2"
      placeholder="업무명"
      value={taskName}
      onChange={(e) => setTaskName(e.target.value)}
    />

    <select
      className="rounded-xl border p-2"
      value={taskType}
      onChange={(e) => setTaskType(e.target.value)}
    >
      <option>발주</option>
      <option>입고</option>
      <option>출고</option>
      <option>설계</option>
      <option>현장</option>
      <option>기타</option>
    </select>

    <input
      type="number"
      className="rounded-xl border p-2"
      value={taskOrder}
      onChange={(e) =>
        setTaskOrder(Number(e.target.value))
      }
    />

    <button
      onClick={addTemplate}
      disabled={isSaving}
      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
    >
      {isSaving ? "저장중..." : "+ 업무 추가"}
    </button>

  </div>
</div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500">불러오는 중...</div>
        ) : (
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b text-sm text-slate-500">
                <th className="p-3 text-left">순서</th>
                <th className="p-3 text-left">업무명</th>
                <th className="p-3 text-left">업무유형</th>
                <th className="p-3 text-left">생성일</th>
                {canDelete && <th className="p-3 text-right">관리</th>}
              </tr>
            </thead>

            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">{template.task_order || "-"}</td>
                  <td className="p-3 font-medium text-slate-900">
                    {template.task_name || "-"}
                  </td>
                  <td className="p-3">{template.task_type || "-"}</td>
                  <td className="p-3 text-slate-500">
                    {template.created_at
                      ? template.created_at.slice(0, 10)
                      : "-"}
                  </td>
                  {canDelete && (
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        title="업무 템플릿 삭제"
                        aria-label={`${template.task_name || "업무 템플릿"} 삭제`}
                        disabled={isDeleting}
                        onClick={() => void prepareDelete(template)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {templates.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 5 : 4} className="p-8 text-center text-slate-500">
                    등록된 업무 템플릿이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="업무 템플릿 삭제"
        description={`"${deleteTarget?.task_name || "업무 템플릿"}" 항목을 삭제하시겠습니까?\n삭제한 데이터는 복구할 수 없습니다.\n기존 프로젝트에 생성된 업무는 유지됩니다.`}
        confirmLabel="삭제"
        danger
        isPending={isDeleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (isDeleting) return;
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
