"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type TaskTemplate = {
  id: number;
  process_type: string;
  task_order: number | null;
  task_name: string | null;
  task_type: string | null;
  created_at: string | null;
};

const processList = ["MH", "SH", "AS", "본납-문틀", "본납-도어"];

export default function SettingsPage() {
  const [selectedProcess, setSelectedProcess] = useState("MH");
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState("발주");
  const [taskOrder, setTaskOrder] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const loadTemplates = useCallback(async function loadTemplates() {
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
        process_type: selectedProcess,
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

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">설정</h1>
        <p className="mt-1 text-sm text-slate-500">
          업무 템플릿, 공정, 시스템 옵션을 관리합니다.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex gap-3 border-b border-slate-200 pb-4">
          <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            업무 템플릿
          </button>

          <button
            disabled
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
          >
            공정관리 준비중
          </button>

          <button
            disabled
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
          >
            시스템 준비중
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between">
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
            {processList.map((process) => (
              <option key={process} value={process}>
                {process}
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
                </tr>
              ))}

              {templates.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    등록된 업무 템플릿이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
