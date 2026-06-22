"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: number;
  project_code: string | null;
  project_name: string;
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
const workFilterList = ["전체", "오늘 할 일", "지연", "오늘 마감", "진행중", "완료"];

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [workFilter, setWorkFilter] = useState("전체");
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function isTodayTodo(task: TaskWithProject) {
    const today = getToday();

    if (task.status === "완료") return false;

    return (
      task.status === "진행중" ||
      task.start_date === today ||
      task.due_date === today ||
      (task.due_date !== null && task.due_date < today) ||
      (task.start_date !== null && task.start_date <= today)
    );
  }

  function getTaskDueLabel(task: TaskWithProject) {
    const today = getToday();

    if (task.status === "완료") {
      return {
        text: "완료",
        className: "text-green-600 font-bold",
      };
    }

    if (task.due_date && task.due_date < today) {
      return {
        text: "지연",
        className: "text-red-600 font-bold",
      };
    }

    if (task.due_date === today) {
      return {
        text: "오늘 마감",
        className: "text-orange-600 font-bold",
      };
    }

    if (task.start_date === today) {
      return {
        text: "오늘 시작",
        className: "text-blue-600 font-bold",
      };
    }

    if (task.status === "진행중") {
      return {
        text: "진행중",
        className: "text-blue-600 font-bold",
      };
    }

    return {
      text: "대기",
      className: "text-gray-600",
    };
  }

  async function loadTasks() {
    setIsLoading(true);

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .order("project_id", { ascending: false })
      .order("task_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (taskError) {
      alert(taskError.message);
      setIsLoading(false);
      return;
    }

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, project_code, project_name");

    if (projectError) {
      alert(projectError.message);
      setIsLoading(false);
      return;
    }

    const projects = projectData || [];

    const mergedTasks = (taskData || []).map((task) => {
      const matchedProject =
        projects.find((project) => project.id === task.project_id) || null;

      return {
        ...task,
        project: matchedProject,
      };
    });

    setTasks(mergedTasks);
    setIsLoading(false);
  }

  async function updateTaskStatus(taskId: number, newStatus: string) {
    if (isUpdating) return;

    setIsUpdating(true);

    const today = getToday();

    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_date: newStatus === "완료" ? today : null,
      })
      .eq("id", taskId);

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: newStatus,
              completed_date: newStatus === "완료" ? today : null,
            }
          : task
      )
    );

    setIsUpdating(false);
  }

  const assigneeList = useMemo(() => {
    const list = tasks
      .map((task) => task.assignee)
      .filter((value): value is string => Boolean(value));

    return ["전체", ...Array.from(new Set(list))];
  }, [tasks]);

  const taskTypeList = useMemo(() => {
    const list = tasks
      .map((task) => task.task_type)
      .filter((value): value is string => Boolean(value));

    return ["전체", ...Array.from(new Set(list))];
  }, [tasks]);

  const filteredTasks = tasks.filter((task) => {
    const today = getToday();

    const assigneeMatched =
      assigneeFilter === "전체" || task.assignee === assigneeFilter;

    const statusMatched =
      statusFilter === "전체" || task.status === statusFilter;

    const typeMatched = typeFilter === "전체" || task.task_type === typeFilter;

    let workMatched = true;

    if (workFilter === "오늘 할 일") {
      workMatched = isTodayTodo(task);
    } else if (workFilter === "지연") {
      workMatched =
        task.status !== "완료" &&
        task.due_date !== null &&
        task.due_date < today;
    } else if (workFilter === "오늘 마감") {
      workMatched = task.status !== "완료" && task.due_date === today;
    } else if (workFilter === "진행중") {
      workMatched = task.status === "진행중";
    } else if (workFilter === "완료") {
      workMatched = task.status === "완료";
    }

    return assigneeMatched && statusMatched && typeMatched && workMatched;
  });

  const totalCount = filteredTasks.length;

  const waitingCount = filteredTasks.filter(
    (task) => !task.status || task.status === "대기"
  ).length;

  const activeCount = filteredTasks.filter(
    (task) => task.status === "진행중"
  ).length;

  const completedCount = filteredTasks.filter(
    (task) => task.status === "완료"
  ).length;

  const todayTodoCount = tasks.filter((task) => isTodayTodo(task)).length;

  const delayedCount = tasks.filter(
    (task) =>
      task.status !== "완료" &&
      task.due_date !== null &&
      task.due_date < getToday()
  ).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">업무 관리</h1>

        <button
          onClick={loadTasks}
          className="bg-slate-700 text-white px-4 py-2 rounded"
        >
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">조회 업무</h3>
          <p className="text-3xl font-bold">{totalCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">오늘 할 일</h3>
          <p className="text-3xl font-bold text-orange-600">{todayTodoCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">지연</h3>
          <p className="text-3xl font-bold text-red-600">{delayedCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">완료</h3>
          <p className="text-3xl font-bold text-green-600">{completedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">대기</h3>
          <p className="text-3xl font-bold text-gray-600">{waitingCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">진행중</h3>
          <p className="text-3xl font-bold text-blue-600">{activeCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5 col-span-2">
          <h3 className="text-gray-600">현재 필터</h3>
          <p className="text-lg font-bold">
            {workFilter} / {assigneeFilter} / {statusFilter} / {typeFilter}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">업무구분</label>
            <select
              value={workFilter}
              onChange={(e) => setWorkFilter(e.target.value)}
              className="border w-full p-2 rounded"
            >
              {workFilterList.map((filter) => (
                <option key={filter} value={filter}>
                  {filter}
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

          <div>
            <label className="block text-sm text-gray-600 mb-1">업무유형</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border w-full p-2 rounded"
            >
              {taskTypeList.map((taskType) => (
                <option key={taskType} value={taskType}>
                  {taskType}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-5 overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">불러오는 중...</div>
        ) : (
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">업무상태</th>
                <th className="text-left p-2">프로젝트</th>
                <th className="text-left p-2">순번</th>
                <th className="text-left p-2">업무명</th>
                <th className="text-left p-2">업무유형</th>
                <th className="text-left p-2">담당자</th>
                <th className="text-left p-2">시작일</th>
                <th className="text-left p-2">마감일</th>
                <th className="text-left p-2">상태변경</th>
                <th className="text-left p-2">완료일</th>
              </tr>
            </thead>

            <tbody>
              {filteredTasks.map((task) => {
                const dueLabel = getTaskDueLabel(task);

                return (
                  <tr key={task.id} className="border-b hover:bg-gray-50">
                    <td className={`p-2 ${dueLabel.className}`}>
                      {dueLabel.text}
                    </td>

                    <td className="p-2">
                      {task.project ? (
                        <Link
                          href={`/projects/${task.project.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {task.project.project_name}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="p-2">{task.task_order || "-"}</td>
                    <td className="p-2">{task.task_name || "-"}</td>
                    <td className="p-2">{task.task_type || "-"}</td>
                    <td className="p-2">{task.assignee || "-"}</td>
                    <td className="p-2">{task.start_date || "-"}</td>
                    <td className="p-2">{task.due_date || "-"}</td>

                    <td className="p-2">
                      <select
                        value={task.status || "대기"}
                        disabled={isUpdating}
                        onChange={(e) =>
                          updateTaskStatus(task.id, e.target.value)
                        }
                        className="border px-3 py-1 rounded"
                      >
                        {statusList
                          .filter((status) => status !== "전체")
                          .map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                      </select>
                    </td>

                    <td className="p-2">{task.completed_date || "-"}</td>
                  </tr>
                );
              })}

              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-500">
                    조회된 업무가 없습니다.
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