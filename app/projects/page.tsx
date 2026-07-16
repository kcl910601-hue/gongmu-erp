"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addActivity } from "@/lib/activity";
import {
  getProjects,
  normalizeAssemblyVendor,
  type ProjectListItem,
} from "@/lib/projects";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getProjectStatusLabel,
  isProjectCompleted,
  isProjectInProgress,
  normalizeProjectStatus,
} from "@/lib/status";

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
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [processFilter, setProcessFilter] = useState("전체");
  const [isAdmin, setIsAdmin] = useState(false);

  const [form, setForm] = useState({
    project_code: "",
    project_name: "",
    client_name: "",
    assembly_vendor: "",
    process_type: "MH",
    salesperson: "이승재",
    site_address: "",
    task_manager: "김초롱",
    start_date: "",
    end_date: "",
  });

  const salesList = ["이승재", "안성현", "고민구", "홍석봉"];
  const managerList = ["김초롱", "류창석", "이재성", "김한솔"];
  const processList = ["MH", "SH", "AS", "본납-문틀", "본납-도어"];

  const fetchProjects = useCallback(async function fetchProjects() {
    const { data, error } = await getProjects();

    if (error) {
      alert(error.message);
      return;
    }

    setProjects(data);
  }, []);

const loadRole = useCallback(async function loadRole() {
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
}, []);


  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProjects();
      void loadRole();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchProjects, loadRole]);

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
            client_name: form.client_name.trim() || null,
            assembly_vendor: normalizeAssemblyVendor(form.assembly_vendor),
            process_type: form.process_type,
            salesperson: form.salesperson,
            site_address: form.site_address.trim() || null,
            task_manager: form.task_manager,
            status: "in_progress",
            start_date: form.start_date || null,
            end_date: form.end_date || null,
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
        client_name: "",
        assembly_vendor: "",
        process_type: "MH",
        salesperson: "이승재",
        site_address: "",
        task_manager: "김초롱",
        start_date: "",
        end_date: "",
      });

      setShowModal(false);
      await fetchProjects();

      await addActivity({
        actionType: "project_create",
        targetType: "project",
        targetId: projectData.id,
        projectId: projectData.id,
        title: "프로젝트 생성",
        description: `${projectData.project_code || "-"} - ${projectData.project_name}`,
      });

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

  function getStatusBadgeVariant(status: string | null): BadgeVariant {
    const statusValue = normalizeProjectStatus(status);

    if (statusValue === "completed") {
      return "success";
    }

    if (statusValue === "in_progress") {
      return "info";
    }

    if (statusValue === "hold") {
      return "warning";
    }

    if (statusValue === "pending") {
      return "default";
    }

    return "default";
  }

  function formatDate(date: string | null) {
    return date ? date.slice(0, 10) : "-";
  }

  const totalProjects = projects.length;

  const activeProjects = projects.filter(
    (project) => isProjectInProgress(project.status)
  ).length;

  const completedProjects = projects.filter(
    (project) => isProjectCompleted(project.status)
  ).length;

  const delayedProjects = projects.filter(
    (project) => normalizeProjectStatus(project.status) === "hold"
  ).length;

  const filteredProjects = projects.filter((project) => {
    const keyword = search.trim().toLowerCase();

    const searchMatched =
      keyword === "" ||
      project.project_name.toLowerCase().includes(keyword) ||
      (project.project_code || "").toLowerCase().includes(keyword) ||
      (project.assembly_vendor || "").toLowerCase().includes(keyword) ||
      project.process_type.toLowerCase().includes(keyword) ||
      (project.salesperson || "").toLowerCase().includes(keyword) ||
      (project.task_manager || "").toLowerCase().includes(keyword);

    const statusMatched =
      statusFilter === "전체" ||
      normalizeProjectStatus(project.status) === normalizeProjectStatus(statusFilter);

    const processMatched =
      processFilter === "전체" || project.process_type === processFilter;

    return searchMatched && statusMatched && processMatched;
  });

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-7 text-slate-900 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">프로젝트 관리</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            프로젝트 등록, 진행상태, 담당자를 통합 관리합니다.
          </p>
        </div>

        <Button
          onClick={() => setShowModal(true)}
          variant="primary"
          className="flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          프로젝트 등록
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">전체 프로젝트</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            {totalProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">진행중</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-blue-600">
            {activeProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">완료</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-emerald-600">
            {completedProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">지연</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-red-600">
            {delayedProjects}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(160px,0.45fr)_minmax(160px,0.45fr)]">
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-slate-500">검색</label>
            <div className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 transition-colors focus-within:border-blue-300 focus-within:bg-white">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="프로젝트명, 코드, 공정, 담당자 검색"
                className="h-full w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white"
            >
              <option value="전체">전체</option>
              <option value="진행중">진행중</option>
              <option value="완료">완료</option>
              <option value="지연">지연</option>
              <option value="대기">대기</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">공정</label>
            <select
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white"
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

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">프로젝트 목록</h2>
            <p className="mt-1 text-sm text-slate-500">
              검색 및 필터 조건에 맞는 프로젝트를 표시합니다.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {filteredProjects.length}건
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px]">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-3 py-3 text-left">프로젝트명</th>
                <th className="px-3 py-3 text-left">발주처</th>
                <th className="px-3 py-3 text-left">조립처</th>
                <th className="px-3 py-3 text-left">담당자</th>
                <th className="px-3 py-3 text-left">진행상태</th>
                <th className="px-3 py-3 text-left">시작일</th>
                <th className="px-3 py-3 text-left">종료일</th>
                <th className="px-3 py-3 text-left">등록일</th>
                <th className="px-3 py-3 text-left">관리</th>
              </tr>
            </thead>

            <tbody>
              {filteredProjects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-slate-100 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <td className="px-3 py-3.5">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-semibold text-slate-950 hover:text-blue-600 hover:underline"
                    >
                      {project.project_name}
                    </Link>
                    <div className="mt-1 text-xs text-slate-400">
                      {project.project_code || "코드 없음"}
                    </div>
                  </td>

                  <td className="px-3 py-3.5">{project.client_name || "-"}</td>
                  <td className="px-3 py-3.5">{project.assembly_vendor || "-"}</td>
                  <td className="px-3 py-3.5">{project.task_manager || "-"}</td>
                  <td className="px-3 py-3.5">
                    <Badge
                      variant={getStatusBadgeVariant(project.status)}
                      className="font-semibold"
                    >
                      {getProjectStatusLabel(project.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">
                    {formatDate(project.start_date)}
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">
                    {formatDate(project.end_date || project.completion_due_date)}
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">
                    {formatDate(project.created_at)}
                  </td>

                  <td className="px-3 py-3.5">
                    <div className="flex gap-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:border-blue-200 hover:bg-blue-50"
                      >
                        수정
                      </Link>

                      {isAdmin && (
                        <button
                          onClick={() => deleteProject(project.id)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50"
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
                  <td colSpan={9} className="p-0">
                    <EmptyState
                      message="조회된 프로젝트가 없습니다."
                      className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

              <input
                className="w-full rounded-xl border p-2"
                placeholder="발주처"
                value={form.client_name}
                onChange={(e) =>
                  setForm({ ...form, client_name: e.target.value })
                }
              />

              <input
                className="w-full rounded-xl border p-2"
                placeholder="조립처"
                value={form.assembly_vendor}
                onChange={(e) =>
                  setForm({ ...form, assembly_vendor: e.target.value })
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

              <input
                className="w-full rounded-xl border p-2"
                placeholder="현장주소"
                value={form.site_address}
                onChange={(e) =>
                  setForm({ ...form, site_address: e.target.value })
                }
              />

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
                value={form.end_date}
                onChange={(e) =>
                  setForm({
                    ...form,
                    end_date: e.target.value,
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
