"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderKanban,
  RefreshCw,
  Search,
  Truck,
  UserCheck,
} from "lucide-react";
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

type Task = {
  id: number;
  project_id: number;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
};

type Shipment = {
  id: number;
  status: string | null;
};

type ProjectWithProgress = Project & {
  progress: number;
  dueStatus: string;
};

type TodayTodoSummary = {
  assignee: string;
  active: number;
  todayStart: number;
  todayDue: number;
  delayed: number;
  tasks: Task[];
};

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [recentProjects, setRecentProjects] = useState<ProjectWithProgress[]>([]);
  const [todayTodoSummary, setTodayTodoSummary] = useState<TodayTodoSummary[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function getDaysLeft(date: string | null) {
    if (!date) return null;

    const today = new Date(getToday());
    const dueDate = new Date(date);
    const diff = dueDate.getTime() - today.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function getDueStatus(project: Project) {
    if (project.status === "완료") return "완료";
    if (!project.completion_due_date) return "미정";

    const daysLeft = getDaysLeft(project.completion_due_date);

    if (daysLeft === null) return "미정";
    if (daysLeft < 0) return "지연";
    if (daysLeft <= 7) return "임박";

    return "정상";
  }

  function getProjectName(projectId: number) {
    const project = projects.find((item) => item.id === projectId);
    return project?.project_name || "-";
  }

  function makeTodayTodoSummary(taskList: Task[]) {
    const today = getToday();
    const grouped: Record<string, TodayTodoSummary> = {};

    const targetTasks = taskList.filter((task) => {
      if (task.status === "완료") return false;

      return (
        task.status === "진행중" ||
        task.start_date === today ||
        task.due_date === today ||
        (task.due_date !== null && task.due_date < today) ||
        (task.start_date !== null && task.start_date <= today)
      );
    });

    targetTasks.forEach((task) => {
      const assignee = task.assignee || "미지정";

      if (!grouped[assignee]) {
        grouped[assignee] = {
          assignee,
          active: 0,
          todayStart: 0,
          todayDue: 0,
          delayed: 0,
          tasks: [],
        };
      }

      if (task.status === "진행중") grouped[assignee].active += 1;
      if (task.start_date === today) grouped[assignee].todayStart += 1;
      if (task.due_date === today) grouped[assignee].todayDue += 1;
      if (task.due_date !== null && task.due_date < today) {
        grouped[assignee].delayed += 1;
      }

      grouped[assignee].tasks.push(task);
    });

    return Object.values(grouped).sort((a, b) => {
      const aScore = a.delayed * 3 + a.todayDue * 2 + a.active + a.todayStart;
      const bScore = b.delayed * 3 + b.todayDue * 2 + b.active + b.todayStart;
      return bScore - aScore;
    });
  }

  async function loadDashboard() {
    setIsLoading(true);

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .order("id", { ascending: false });

    if (projectError) {
      alert(projectError.message);
      setIsLoading(false);
      return;
    }

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select(
        "id, project_id, task_name, task_type, assignee, status, start_date, due_date, completed_date"
      );

    if (taskError) {
      alert(taskError.message);
      setIsLoading(false);
      return;
    }

    const { data: shipmentData, error: shipmentError } = await supabase
      .from("shipments")
      .select("id, status");

    if (shipmentError) {
      alert(shipmentError.message);
      setIsLoading(false);
      return;
    }

    const loadedProjects = projectData || [];
    const loadedTasks = taskData || [];

    setProjects(loadedProjects);
    setTasks(loadedTasks);
    setShipments(shipmentData || []);
    setTodayTodoSummary(makeTodayTodoSummary(loadedTasks));

    const projectsWithProgress = loadedProjects.slice(0, 10).map((project) => {
      const projectTasks = loadedTasks.filter(
        (task) => task.project_id === project.id
      );

      const completedTasks = projectTasks.filter(
        (task) => task.status === "완료"
      );

      const progress =
        projectTasks.length > 0
          ? Math.round((completedTasks.length / projectTasks.length) * 100)
          : 0;

      return {
        ...project,
        progress,
        dueStatus: getDueStatus(project),
      };
    });

    setRecentProjects(projectsWithProgress);
    setIsLoading(false);
  }

  function getStatusBadge(status: string) {
    if (status === "완료") {
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }

    if (status === "진행중") {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }

    if (status === "지연") {
      return "bg-red-100 text-red-700 border-red-200";
    }

    if (status === "임박") {
      return "bg-orange-100 text-orange-700 border-orange-200";
    }

    return "bg-slate-100 text-slate-600 border-slate-200";
  }

  const today = getToday();

  const totalProjects = projects.length;
  const activeProjects = projects.filter((project) => project.status === "진행중").length;
  const completedProjects = projects.filter((project) => project.status === "완료").length;
  const delayedProjects = projects.filter((project) => getDueStatus(project) === "지연").length;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "완료").length;
  const activeTasks = tasks.filter((task) => task.status === "진행중").length;

  const totalProgress =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const todayDueTasks = tasks.filter(
    (task) => task.status !== "완료" && task.due_date === today
  ).length;

  const delayedTasks = tasks.filter(
    (task) =>
      task.status !== "완료" &&
      task.due_date !== null &&
      task.due_date < today
  ).length;

  const waitingShipments = shipments.filter(
    (shipment) => !shipment.status || shipment.status === "출고대기"
  ).length;

  const selectedTodayTodo = selectedAssignee
    ? todayTodoSummary.find((item) => item.assignee === selectedAssignee)
    : null;

  const searchedProjects = recentProjects.filter((project) => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return true;

    return (
      project.project_name.toLowerCase().includes(keyword) ||
      (project.project_code || "").toLowerCase().includes(keyword) ||
      project.process_type.toLowerCase().includes(keyword) ||
      (project.task_manager || "").toLowerCase().includes(keyword)
    );
  });

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">
            프로젝트, 업무, 출고 현황을 한눈에 확인합니다.
          </p>
        </div>

        <button
          onClick={loadDashboard}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
        >
          <RefreshCw size={16} />
          새로고침
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Search className="text-slate-400" size={20} />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="프로젝트명, 코드, 공정, 담당자로 검색"
            className="w-full outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
          불러오는 중...
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-4 gap-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">전체 프로젝트</p>
                  <p className="mt-2 text-3xl font-bold">{totalProjects}</p>
                </div>
                <div className="rounded-xl bg-blue-100 p-3 text-blue-600">
                  <FolderKanban />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">진행중 프로젝트</p>
                  <p className="mt-2 text-3xl font-bold text-blue-600">
                    {activeProjects}
                  </p>
                </div>
                <div className="rounded-xl bg-indigo-100 p-3 text-indigo-600">
                  <Clock />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">완료 프로젝트</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-600">
                    {completedProjects}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600">
                  <CheckCircle2 />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">지연 프로젝트</p>
                  <p className="mt-2 text-3xl font-bold text-red-600">
                    {delayedProjects}
                  </p>
                </div>
                <div className="rounded-xl bg-red-100 p-3 text-red-600">
                  <AlertTriangle />
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-4 gap-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">오늘 마감 업무</p>
              <p className="mt-2 text-3xl font-bold text-orange-600">
                {todayDueTasks}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">지연 업무</p>
              <p className="mt-2 text-3xl font-bold text-red-600">
                {delayedTasks}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">진행중 업무</p>
              <p className="mt-2 text-3xl font-bold text-blue-600">
                {activeTasks}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">출고대기</p>
              <div className="mt-2 flex items-center gap-3">
                <Truck className="text-orange-500" />
                <p className="text-3xl font-bold text-orange-600">
                  {waitingShipments}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-6">
            <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">오늘 할 일</h2>
                  <p className="text-sm text-slate-500">
                    담당자별 주요 업무 현황
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                  {today}
                </span>
              </div>

              {todayTodoSummary.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {todayTodoSummary.map((item) => (
                    <div
                      key={item.assignee}
                      onClick={() => setSelectedAssignee(item.assignee)}
                      className={`cursor-pointer rounded-2xl border p-4 transition ${
                        selectedAssignee === item.assignee
                          ? "border-blue-400 bg-blue-50"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserCheck size={18} className="text-slate-500" />
                          <h3 className="font-bold">{item.assignee}</h3>
                        </div>
                        <span className="text-sm text-slate-500">
                          {item.tasks.length}건
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center text-sm">
                        <div className="rounded-xl bg-white p-2">
                          <p className="text-slate-400">진행</p>
                          <p className="font-bold text-blue-600">{item.active}</p>
                        </div>
                        <div className="rounded-xl bg-white p-2">
                          <p className="text-slate-400">시작</p>
                          <p className="font-bold">{item.todayStart}</p>
                        </div>
                        <div className="rounded-xl bg-white p-2">
                          <p className="text-slate-400">마감</p>
                          <p className="font-bold text-orange-600">
                            {item.todayDue}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-2">
                          <p className="text-slate-400">지연</p>
                          <p className="font-bold text-red-600">{item.delayed}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                  오늘 할 일이 없습니다.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">전체 진행률</h2>
              <p className="mt-1 text-sm text-slate-500">전체 업무 기준</p>

              <div className="mt-8">
                <p className="text-5xl font-bold text-blue-600">
                  {totalProgress}%
                </p>

                <div className="mt-5 h-3 w-full rounded-full bg-slate-200">
                  <div
                    className="h-3 rounded-full bg-blue-600"
                    style={{ width: `${totalProgress}%` }}
                  />
                </div>

                <div className="mt-4 text-sm text-slate-500">
                  완료 {completedTasks}건 / 전체 {totalTasks}건
                </div>
              </div>
            </div>
          </div>

          {selectedTodayTodo && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    {selectedTodayTodo.assignee} 오늘 할 일 상세
                  </h2>
                  <p className="text-sm text-slate-500">
                    클릭하면 프로젝트 상세로 이동합니다.
                  </p>
                </div>

                <button
                  onClick={() => setSelectedAssignee(null)}
                  className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                >
                  선택 해제
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b text-sm text-slate-500">
                      <th className="p-3 text-left">상태</th>
                      <th className="p-3 text-left">프로젝트</th>
                      <th className="p-3 text-left">업무명</th>
                      <th className="p-3 text-left">업무유형</th>
                      <th className="p-3 text-left">시작일</th>
                      <th className="p-3 text-left">마감일</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedTodayTodo.tasks.map((task) => {
                      let displayStatus = task.status || "대기";

                      if (task.due_date && task.due_date < today) {
                        displayStatus = "지연";
                      } else if (task.due_date === today) {
                        displayStatus = "오늘마감";
                      } else if (task.start_date === today) {
                        displayStatus = "오늘시작";
                      }

                      return (
                        <tr key={task.id} className="border-b hover:bg-slate-50">
                          <td className="p-3">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs ${getStatusBadge(
                                displayStatus
                              )}`}
                            >
                              {displayStatus}
                            </span>
                          </td>

                          <td className="p-3">
                            <Link
                              href={`/projects/${task.project_id}`}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              {getProjectName(task.project_id)}
                            </Link>
                          </td>

                          <td className="p-3">{task.task_name || "-"}</td>
                          <td className="p-3">{task.task_type || "-"}</td>
                          <td className="p-3">{task.start_date || "-"}</td>
                          <td className="p-3">{task.due_date || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold">최근 프로젝트</h2>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b text-sm text-slate-500">
                    <th className="p-3 text-left">프로젝트코드</th>
                    <th className="p-3 text-left">프로젝트명</th>
                    <th className="p-3 text-left">공정</th>
                    <th className="p-3 text-left">담당자</th>
                    <th className="p-3 text-left">준공예정일</th>
                    <th className="p-3 text-left">납기상태</th>
                    <th className="p-3 text-left">진행률</th>
                  </tr>
                </thead>

                <tbody>
                  {searchedProjects.map((project) => (
                    <tr key={project.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">{project.project_code || "-"}</td>

                      <td className="p-3">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {project.project_name}
                        </Link>
                      </td>

                      <td className="p-3">{project.process_type}</td>
                      <td className="p-3">{project.task_manager || "-"}</td>
                      <td className="p-3">
                        {project.completion_due_date || "-"}
                      </td>

                      <td className="p-3">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs ${getStatusBadge(
                            project.dueStatus
                          )}`}
                        >
                          {project.dueStatus}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-24 rounded-full bg-slate-200">
                            <div
                              className="h-2 rounded-full bg-blue-600"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">
                            {project.progress}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {searchedProjects.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        조회된 프로젝트가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}