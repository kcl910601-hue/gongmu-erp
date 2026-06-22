"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: number;
  project_name: string;
  project_code: string | null;
  status: string | null;
};

type Task = {
  id: number;
  project_id: number;
  task_order: number | null;
  task_type: string | null;
  task_name: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
};

type TaskWithProject = Task & {
  project: Project | null;
};

const statusList = ["전체", "대기", "진행중", "완료"];

export default function GanttPage() {
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [projectFilter, setProjectFilter] = useState("전체");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadGantt();
  }, []);

  async function loadGantt() {
    setIsLoading(true);

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, project_name, project_code, status")
      .order("id", { ascending: false });

    if (projectError) {
      alert(projectError.message);
      setIsLoading(false);
      return;
    }

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select(
        "id, project_id, task_order, task_type, task_name, assignee, status, start_date, due_date, completed_date"
      )
      .order("project_id", { ascending: false })
      .order("task_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (taskError) {
      alert(taskError.message);
      setIsLoading(false);
      return;
    }

    const projects = (projectData || []) as Project[];

    const mergedTasks = ((taskData || []) as Task[]).map((task) => {
      const project =
        projects.find((item) => item.id === task.project_id) || null;

      return {
        ...task,
        project,
      };
    });

    setTasks(mergedTasks);
    setIsLoading(false);
  }

  function getStatusStyle(status: string | null) {
    if (status === "완료") {
      return "bg-green-500";
    }

    if (status === "진행중") {
      return "bg-blue-500";
    }

    return "bg-gray-400";
  }

  function getStatusBadge(status: string | null) {
    if (status === "완료") {
      return "bg-green-100 text-green-700";
    }

    if (status === "진행중") {
      return "bg-blue-100 text-blue-700";
    }

    return "bg-gray-100 text-gray-700";
  }

  function getTaskStartDate(task: TaskWithProject) {
    return task.start_date || task.completed_date || task.due_date;
  }

  function getTaskEndDate(task: TaskWithProject) {
    return task.due_date || task.completed_date || task.start_date;
  }

  function getDayDiff(start: string, end: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = endDate.getTime() - startDate.getTime();

    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
  }

  function toggleTaskType(type: string) {
    setSelectedTaskTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((item) => item !== type);
      }

      return [...prev, type];
    });
  }

  function clearTaskTypeFilter() {
    setSelectedTaskTypes([]);
  }

  const projectList = useMemo(() => {
    const names = tasks
      .map((task) => task.project?.project_name)
      .filter((value): value is string => Boolean(value));

    return ["전체", ...Array.from(new Set(names))];
  }, [tasks]);

  const assigneeList = useMemo(() => {
    const names = tasks
      .map((task) => task.assignee)
      .filter((value): value is string => Boolean(value));

    return ["전체", ...Array.from(new Set(names))];
  }, [tasks]);

  const taskTypeList = useMemo(() => {
    const types = tasks
      .map((task) => task.task_type)
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(types));
  }, [tasks]);

  const filteredTasks = tasks.filter((task) => {
    const projectMatched =
      projectFilter === "전체" || task.project?.project_name === projectFilter;

    const assigneeMatched =
      assigneeFilter === "전체" || task.assignee === assigneeFilter;

    const statusMatched =
      statusFilter === "전체" || task.status === statusFilter;

    const taskTypeMatched =
      selectedTaskTypes.length === 0 ||
      selectedTaskTypes.includes(task.task_type || "");

    return projectMatched && assigneeMatched && statusMatched && taskTypeMatched;
  });

  const groupedTasks = useMemo(() => {
    const grouped: Record<string, TaskWithProject[]> = {};

    filteredTasks.forEach((task) => {
      const projectName = task.project?.project_name || "프로젝트 미지정";

      if (!grouped[projectName]) {
        grouped[projectName] = [];
      }

      grouped[projectName].push(task);
    });

    return Object.entries(grouped);
  }, [filteredTasks]);

  const totalTasks = filteredTasks.length;

  const completedTasks = filteredTasks.filter(
    (task) => task.status === "완료"
  ).length;

  const activeTasks = filteredTasks.filter(
    (task) => task.status === "진행중"
  ).length;

  const waitingTasks = filteredTasks.filter(
    (task) => !task.status || task.status === "대기"
  ).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">간트차트</h1>

        <button
          onClick={loadGantt}
          className="bg-slate-700 text-white px-4 py-2 rounded"
        >
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">조회 업무</h3>
          <p className="text-3xl font-bold">{totalTasks}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">대기</h3>
          <p className="text-3xl font-bold text-gray-600">{waitingTasks}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">진행중</h3>
          <p className="text-3xl font-bold text-blue-600">{activeTasks}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">완료</h3>
          <p className="text-3xl font-bold text-green-600">
            {completedTasks}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">프로젝트</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="border w-full p-2 rounded"
            >
              {projectList.map((projectName) => (
                <option key={projectName} value={projectName}>
                  {projectName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">담당자</label>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="border w-full p-2 rounded"
            >
              {assigneeList.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border w-full p-2 rounded"
            >
              {statusList.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-gray-600">
              표시할 업무유형
            </label>

            <button
              onClick={clearTaskTypeFilter}
              className="text-sm text-blue-600 hover:underline"
            >
              전체 보기
            </button>
          </div>

          {taskTypeList.length === 0 ? (
            <div className="text-sm text-gray-500">
              등록된 업무유형이 없습니다.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {taskTypeList.map((type) => (
                <label
                  key={type}
                  className={`flex items-center gap-2 border rounded px-3 py-2 cursor-pointer ${
                    selectedTaskTypes.includes(type)
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-gray-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTaskTypes.includes(type)}
                    onChange={() => toggleTaskType(type)}
                  />

                  <span>{type}</span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-2 text-sm text-gray-500">
            아무것도 선택하지 않으면 전체 업무유형이 표시됩니다.
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">불러오는 중...</div>
        ) : groupedTasks.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            조회된 간트 데이터가 없습니다.
          </div>
        ) : (
          <div className="space-y-8">
            {groupedTasks.map(([projectName, projectTasks]) => {
              const projectId = projectTasks[0]?.project?.id;

              return (
                <div key={projectName} className="border rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">{projectName}</h2>

                    {projectId && (
                      <Link
                        href={`/projects/${projectId}`}
                        className="text-blue-600 hover:underline"
                      >
                        프로젝트 열기
                      </Link>
                    )}
                  </div>

                  <div className="space-y-3">
                    {projectTasks.map((task, index) => {
                      const startDate = getTaskStartDate(task);
                      const endDate = getTaskEndDate(task);

                      const duration =
                        startDate && endDate
                          ? getDayDiff(startDate, endDate)
                          : 1;

                      const width = Math.min(100, Math.max(12, duration * 8));
                      const offset = index * 4;

                      return (
                        <div
                          key={task.id}
                          className="grid grid-cols-[220px_1fr_120px] gap-4 items-center"
                        >
                          <div>
                            <div className="font-medium">
                              {task.task_name || "-"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {task.task_type || "-"} /{" "}
                              {task.assignee || "미지정"}
                            </div>
                          </div>

                          <div className="bg-gray-100 rounded h-8 relative overflow-hidden">
                            <div
                              className={`h-8 rounded ${getStatusStyle(
                                task.status
                              )}`}
                              style={{
                                width: `${width}%`,
                                marginLeft: `${offset}%`,
                              }}
                            />

                            <div className="absolute inset-0 flex items-center px-3 text-xs text-gray-700">
                              {startDate || "-"} ~ {endDate || "-"}
                            </div>
                          </div>

                          <div>
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-sm ${getStatusBadge(
                                task.status
                              )}`}
                            >
                              {task.status || "대기"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}