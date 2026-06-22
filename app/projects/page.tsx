"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: number;
  project_code: string | null;
  project_name: string;
  process_type: string;
  salesperson: string | null;
  task_manager: string | null;
  status: string | null;
  start_date: string | null;
  completion_due_date: string | null;
};

type TaskTemplate = {
  id: number;
  process_type: string;
  task_order: number;
  task_name: string;
  task_type: string;
};

export default function ProjectsPage() {
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const [form, setForm] = useState({
    project_code: "",
    project_name: "",
    process_type: "MH",
    salesperson: "이승재",
    task_manager: "김초롱",
    start_date: "",
    completion_due_date: "",
  });

  const salesList = ["이승재", "안성현", "고민구", "홍석봉"];
  const managerList = ["김초롱", "류창석", "이재성", "김한솔"];
  const processList = ["MH", "SH", "AS", "본납-문틀", "본납-도어"];

  async function fetchProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setProjects(data || []);
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  async function addProject() {
    if (isSaving) return;

    if (!form.project_code.trim() || !form.project_name.trim()) {
      alert("프로젝트코드와 프로젝트명을 입력하세요.");
      return;
    }

    setIsSaving(true);

    try {
      const { data: existingProject, error: existingError } = await supabase
        .from("projects")
        .select("id")
        .eq("project_code", form.project_code.trim())
        .maybeSingle();

      if (existingError) {
        alert(existingError.message);
        return;
      }

      if (existingProject) {
        alert("이미 같은 프로젝트코드가 있습니다.");
        return;
      }

      const { data: templates, error: templateError } = await supabase
        .from("task_templates")
        .select("*")
        .eq("process_type", form.process_type)
        .order("task_order", { ascending: true });

      if (templateError) {
        alert(templateError.message);
        return;
      }

      if (!templates || templates.length === 0) {
        alert("선택한 공정의 업무 템플릿이 없습니다.");
        return;
      }

      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .insert([
          {
            project_code: form.project_code.trim(),
            project_name: form.project_name.trim(),
            process_type: form.process_type,
            salesperson: form.salesperson,
            task_manager: form.task_manager,
            status: "진행중",
            start_date: form.start_date || null,
            completion_due_date: form.completion_due_date || null,
          },
        ])
        .select()
        .single();

      if (projectError) {
        alert(projectError.message);
        return;
      }

      const taskRows = (templates as TaskTemplate[]).map((template) => ({
        project_id: projectData.id,
        task_order: template.task_order,
        task_name: template.task_name,
        task_type: template.task_type,
        assignee: form.task_manager,
        status: "대기",
        due_date: null,
        completed_date: null,
        start_date: null,
      }));

      const { error: taskError } = await supabase.from("tasks").insert(taskRows);

      if (taskError) {
        alert(taskError.message);
        return;
      }

      setForm({
        project_code: "",
        project_name: "",
        process_type: "MH",
        salesperson: "이승재",
        task_manager: "김초롱",
        start_date: "",
        completion_due_date: "",
      });

      setShowModal(false);
      fetchProjects();

      alert("프로젝트와 업무가 자동 생성되었습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProject(projectId: number) {
    const confirmed = window.confirm(
      "프로젝트를 삭제하시겠습니까?\n관련 업무 및 출고정보도 함께 삭제됩니다."
    );

    if (!confirmed) return;

    const { error: shipmentError } = await supabase
      .from("shipments")
      .delete()
      .eq("project_id", projectId);

    if (shipmentError) {
      alert(shipmentError.message);
      return;
    }

    const { error: taskError } = await supabase
      .from("tasks")
      .delete()
      .eq("project_id", projectId);

    if (taskError) {
      alert(taskError.message);
      return;
    }

    const { error: projectError } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (projectError) {
      alert(projectError.message);
      return;
    }

    fetchProjects();
    alert("프로젝트가 삭제되었습니다.");
  }

  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">프로젝트 관리</h1>

        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          프로젝트 등록
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-5 overflow-x-auto">
        <table className="w-full min-w-[1050px]">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">프로젝트코드</th>
              <th className="text-left p-2">프로젝트명</th>
              <th className="text-left p-2">공정</th>
              <th className="text-left p-2">영업자</th>
              <th className="text-left p-2">업무담당자</th>
              <th className="text-left p-2">시작일</th>
              <th className="text-left p-2">준공예정일</th>
              <th className="text-left p-2">상태</th>
              <th className="text-left p-2">관리</th>
            </tr>
          </thead>

          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-b">
                <td className="p-2">{project.project_code}</td>

                <td className="p-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {project.project_name}
                  </Link>
                </td>

                <td className="p-2">{project.process_type}</td>
                <td className="p-2">{project.salesperson}</td>
                <td className="p-2">{project.task_manager}</td>
                <td className="p-2">{project.start_date || "-"}</td>
                <td className="p-2">{project.completion_due_date || "-"}</td>
                <td className="p-2">{project.status}</td>

                <td className="p-2">
                  <div className="flex gap-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                    >
                      수정
                    </Link>

                    <button
                      onClick={() => deleteProject(project.id)}
                      className="px-3 py-1 rounded bg-red-600 text-white text-sm"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {projects.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500">
                  등록된 프로젝트가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg p-6 w-[520px]">
            <h2 className="text-2xl font-bold mb-5">프로젝트 등록</h2>

            <div className="space-y-3">
              <input
                className="border w-full p-2 rounded"
                placeholder="프로젝트코드"
                value={form.project_code}
                onChange={(e) =>
                  setForm({ ...form, project_code: e.target.value })
                }
              />

              <input
                className="border w-full p-2 rounded"
                placeholder="프로젝트명"
                value={form.project_name}
                onChange={(e) =>
                  setForm({ ...form, project_name: e.target.value })
                }
              />

              <select
                className="border w-full p-2 rounded"
                value={form.process_type}
                onChange={(e) =>
                  setForm({ ...form, process_type: e.target.value })
                }
              >
                {processList.map((process) => (
                  <option key={process} value={process}>
                    {process}
                  </option>
                ))}
              </select>

              <select
                className="border w-full p-2 rounded"
                value={form.salesperson}
                onChange={(e) =>
                  setForm({ ...form, salesperson: e.target.value })
                }
              >
                {salesList.map((sales) => (
                  <option key={sales} value={sales}>
                    {sales}
                  </option>
                ))}
              </select>

              <select
                className="border w-full p-2 rounded"
                value={form.task_manager}
                onChange={(e) =>
                  setForm({ ...form, task_manager: e.target.value })
                }
              >
                {managerList.map((manager) => (
                  <option key={manager} value={manager}>
                    {manager}
                  </option>
                ))}
              </select>

              <input
                type="date"
                className="border w-full p-2 rounded"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
              />

              <input
                type="date"
                className="border w-full p-2 rounded"
                value={form.completion_due_date}
                onChange={(e) =>
                  setForm({
                    ...form,
                    completion_due_date: e.target.value,
                  })
                }
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="border px-4 py-2 rounded"
                disabled={isSaving}
              >
                취소
              </button>

              <button
                onClick={addProject}
                disabled={isSaving}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}