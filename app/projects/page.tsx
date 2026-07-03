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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [processFilter, setProcessFilter] = useState("전체");
  const [isAdmin, setIsAdmin] = useState(false);

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

async function loadRole() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.email) return;

  const { data, error } = await supabase
    .from("employees")
    .select("role")
    .eq("email", session.user.email)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return;
  }

  setIsAdmin(data?.role === "admin");
}


  useEffect(() => {
  fetchProjects();
  loadRole();
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
      async function loadRole() {
      const {
        data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.email) return;

        const { data } = await supabase
        .from("employees")
        .select("role")
        .eq("email", session.user.email)
        .maybeSingle();

        setIsAdmin(data?.role === "admin");
        }

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

  function getStatusBadge(status: string | null) {
    if (status === "완료") {
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }

    if (status === "진행중") {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }

    if (status === "지연") {
      return "bg-red-100 text-red-700 border-red-200";
    }

    return "bg-slate-100 text-slate-600 border-slate-200";
  }

  const totalProjects = projects.length;

  const activeProjects = projects.filter(
    (project) => project.status === "진행중"
  ).length;

  const completedProjects = projects.filter(
    (project) => project.status === "완료"
  ).length;

  const delayedProjects = projects.filter(
    (project) => project.status === "지연"
  ).length;

  const filteredProjects = projects.filter((project) => {
    const keyword = search.trim().toLowerCase();

    const searchMatched =
      keyword === "" ||
      project.project_name.toLowerCase().includes(keyword) ||
      (project.project_code || "").toLowerCase().includes(keyword) ||
      project.process_type.toLowerCase().includes(keyword) ||
      (project.salesperson || "").toLowerCase().includes(keyword) ||
      (project.task_manager || "").toLowerCase().includes(keyword);

    const statusMatched =
      statusFilter === "전체" || project.status === statusFilter;

    const processMatched =
      processFilter === "전체" || project.process_type === processFilter;

    return searchMatched && statusMatched && processMatched;
  });

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">프로젝트 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            프로젝트 등록, 진행상태, 담당자를 통합 관리합니다.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="rounded-xl bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700"
        >
          프로젝트 등록
        </button>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">전체 프로젝트</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {totalProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">진행중</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">
            {activeProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">완료</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            {completedProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">지연</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {delayedProjects}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm text-slate-500">검색</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="프로젝트명, 코드, 공정, 담당자 검색"
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-500">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-blue-500"
            >
              <option value="전체">전체</option>
              <option value="진행중">진행중</option>
              <option value="완료">완료</option>
              <option value="지연">지연</option>
              <option value="대기">대기</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-500">공정</label>
            <select
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-blue-500"
            >
              <option value="전체">전체</option>
              {processList.map((process) => (
                <option key={process} value={process}>
                  {process}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <table className="w-full min-w-[1050px]">
          <thead>
            <tr className="border-b text-sm text-slate-500">
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
            {filteredProjects.map((project) => (
              <tr key={project.id} className="border-b hover:bg-slate-50">
                <td className="p-2">{project.project_code}</td>

                <td className="p-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {project.project_name}
                  </Link>
                </td>

                <td className="p-2">{project.process_type}</td>
                <td className="p-2">{project.salesperson}</td>
                <td className="p-2">{project.task_manager}</td>
                <td className="p-2">{project.start_date || "-"}</td>
                <td className="p-2">{project.completion_due_date || "-"}</td>

                <td className="p-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadge(
                      project.status
                    )}`}
                  >
                    {project.status || "미정"}
                  </span>
                </td>

                <td className="p-2">
                  <div className="flex gap-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                    >
                      수정
                    </Link>

                    {isAdmin && (
                     <button
                      onClick={() => deleteProject(project.id)}
                      className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                       >
                         삭제
                      </button>
                      )}
                  </div>
                </td>
              </tr>
            ))}

            {filteredProjects.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500">
                  조회된 프로젝트가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[520px] rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-5 text-2xl font-bold">프로젝트 등록</h2>

            <div className="space-y-3">
              <input
                className="w-full rounded-xl border p-2"
                placeholder="프로젝트코드"
                value={form.project_code}
                onChange={(e) =>
                  setForm({ ...form, project_code: e.target.value })
                }
              />

              <input
                className="w-full rounded-xl border p-2"
                placeholder="프로젝트명"
                value={form.project_name}
                onChange={(e) =>
                  setForm({ ...form, project_name: e.target.value })
                }
              />

              <select
                className="w-full rounded-xl border p-2"
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
                className="w-full rounded-xl border p-2"
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
                className="w-full rounded-xl border p-2"
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
                className="w-full rounded-xl border p-2"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
              />

              <input
                type="date"
                className="w-full rounded-xl border p-2"
                value={form.completion_due_date}
                onChange={(e) =>
                  setForm({
                    ...form,
                    completion_due_date: e.target.value,
                  })
                }
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl border px-4 py-2"
                disabled={isSaving}
              >
                취소
              </button>

              <button
                onClick={addProject}
                disabled={isSaving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:bg-gray-400"
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