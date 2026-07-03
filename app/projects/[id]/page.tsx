"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  task_order: number | null;
  task_type: string | null;
  task_name: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
};

type Employee = {
  id: number;
  name: string;
  active: boolean | null;
};

const statusList = ["대기", "진행중", "완료"];
const processList = ["MH", "SH", "AS", "본납-문틀", "본납-도어"];
const salesList = ["이승재", "안성현", "고민구", "홍석봉"];

export default function ProjectDetail() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);

  const [projectForm, setProjectForm] = useState({
    project_code: "",
    project_name: "",
    process_type: "",
    salesperson: "",
    task_manager: "",
    start_date: "",
    completion_due_date: "",
  });

  const [taskForm, setTaskForm] = useState({
    task_name: "",
    task_type: "",
    assignee: "",
    start_date: "",
    due_date: "",
    status: "대기",
  });

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  async function loadProject() {
    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError) {
      alert(projectError.message);
      return;
    }

    setProject(projectData);

    setProjectForm({
      project_code: projectData.project_code || "",
      project_name: projectData.project_name || "",
      process_type: projectData.process_type || "",
      salesperson: projectData.salesperson || "",
      task_manager: projectData.task_manager || "",
      start_date: projectData.start_date || "",
      completion_due_date: projectData.completion_due_date || "",
    });

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("task_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (taskError) {
      alert(taskError.message);
      return;
    }

    setTasks(taskData || []);

    const { data: employeeData, error: employeeError } = await supabase
      .from("employees")
      .select("id, name, active")
      .eq("active", true)
      .order("name", { ascending: true });

    if (employeeError) {
      alert(employeeError.message);
      return;
    }

    setEmployees(employeeData || []);
  }

  function isShipmentTask(task: Task) {
    return (task.task_type || "").includes("출고");
  }

  async function createShipmentFromTask(task: Task) {
    if (!project) return;

    const { data: existingShipment, error: existingError } = await supabase
      .from("shipments")
      .select("id")
      .eq("task_id", task.id)
      .maybeSingle();

    if (existingError) {
      alert(existingError.message);
      return;
    }

    if (existingShipment) return;

    const { error: shipmentError } = await supabase.from("shipments").insert([
      {
        project_id: project.id,
        task_id: task.id,
        site_name: project.project_name,
        item_name: task.task_name || "출고품목",
        quantity: null,
        shipment_date: null,
        vehicle_number: null,
        driver_name: null,
        driver_phone: null,
        destination: null,
        receiver: null,
        status: "출고대기",
        memo: `${task.task_name || ""} ${task.task_type || ""} 업무 완료로 자동 생성`,
      },
    ]);

    if (shipmentError) {
      alert(shipmentError.message);
    }
  }

  async function saveProjectInfo() {
    if (!project || isUpdating) return;

    if (!projectForm.project_code.trim() || !projectForm.project_name.trim()) {
      alert("프로젝트코드와 프로젝트명은 필수입니다.");
      return;
    }

    setIsUpdating(true);

    const { data, error } = await supabase
      .from("projects")
      .update({
        project_code: projectForm.project_code.trim(),
        project_name: projectForm.project_name.trim(),
        process_type: projectForm.process_type,
        salesperson: projectForm.salesperson || null,
        task_manager: projectForm.task_manager || null,
        start_date: projectForm.start_date || null,
        completion_due_date: projectForm.completion_due_date || null,
      })
      .eq("id", project.id)
      .select()
      .single();

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    setProject(data);
    setIsEditingProject(false);
    setIsUpdating(false);
  }

  function cancelProjectEdit() {
    if (!project) return;

    setProjectForm({
      project_code: project.project_code || "",
      project_name: project.project_name || "",
      process_type: project.process_type || "",
      salesperson: project.salesperson || "",
      task_manager: project.task_manager || "",
      start_date: project.start_date || "",
      completion_due_date: project.completion_due_date || "",
    });

    setIsEditingProject(false);
  }

  async function updateProjectStatus(nextTasks: Task[]) {
    if (!project) return;

    let nextProjectStatus = "대기";

    if (nextTasks.length > 0) {
      const isAllCompleted = nextTasks.every((task) => task.status === "완료");
      const hasActiveOrCompleted = nextTasks.some(
        (task) => task.status === "진행중" || task.status === "완료"
      );

      if (isAllCompleted) nextProjectStatus = "완료";
      else if (hasActiveOrCompleted) nextProjectStatus = "진행중";
    }

    if (project.status === nextProjectStatus) return;

    const { error } = await supabase
      .from("projects")
      .update({ status: nextProjectStatus })
      .eq("id", project.id);

    if (error) {
      alert(error.message);
      return;
    }

    setProject({
      ...project,
      status: nextProjectStatus,
    });
  }

  async function saveTaskOrders(nextTasks: Task[]) {
    const normalizedTasks = nextTasks.map((task, index) => ({
      ...task,
      task_order: index + 1,
    }));

    const results = await Promise.all(
      normalizedTasks.map((task) =>
        supabase
          .from("tasks")
          .update({ task_order: task.task_order })
          .eq("id", task.id)
      )
    );

    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
      alert(failedResult.error.message);
      return null;
    }

    return normalizedTasks;
  }

  async function handleTaskDrop(targetTaskId: number) {
    if (isUpdating || draggingTaskId === null || draggingTaskId === targetTaskId) {
      setDraggingTaskId(null);
      return;
    }

    const dragIndex = tasks.findIndex((task) => task.id === draggingTaskId);
    const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);

    if (dragIndex === -1 || targetIndex === -1) {
      setDraggingTaskId(null);
      return;
    }

    setIsUpdating(true);

    const nextTasks = [...tasks];
    const [draggedTask] = nextTasks.splice(dragIndex, 1);
    nextTasks.splice(targetIndex, 0, draggedTask);

    const savedTasks = await saveTaskOrders(nextTasks);

    if (savedTasks) {
      setTasks(savedTasks);
    }

    setDraggingTaskId(null);
    setIsUpdating(false);
  }

  async function duplicateTask(task: Task) {
    if (!project || isUpdating) return;

    setIsUpdating(true);

    const currentIndex = tasks.findIndex((item) => item.id === task.id);

    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          project_id: project.id,
          task_order: currentIndex + 2,
          task_name: `${task.task_name || "업무"}(복사본)`,
          task_type: task.task_type,
          assignee: task.assignee,
          status: "대기",
          start_date: task.start_date,
          due_date: task.due_date,
          completed_date: null,
        },
      ])
      .select()
      .single();

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    const nextTasks = [...tasks];
    nextTasks.splice(currentIndex + 1, 0, data);

    const savedTasks = await saveTaskOrders(nextTasks);

    if (savedTasks) {
      setTasks(savedTasks);
      await updateProjectStatus(savedTasks);
    }

    setIsUpdating(false);
  }

  async function addTask() {
    if (!project || isSavingTask) return;

    if (!taskForm.task_name.trim()) {
      alert("업무명을 입력하세요.");
      return;
    }

    if (!taskForm.task_type.trim()) {
      alert("업무유형을 입력하세요.");
      return;
    }

    setIsSavingTask(true);

    const maxOrder =
      tasks.length > 0
        ? Math.max(...tasks.map((task) => task.task_order || 0))
        : 0;

    const savedAssignee =
      taskForm.assignee === "미배정" || taskForm.assignee === ""
        ? null
        : taskForm.assignee;

    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          project_id: project.id,
          task_order: maxOrder + 1,
          task_name: taskForm.task_name.trim(),
          task_type: taskForm.task_type.trim(),
          assignee: savedAssignee,
          status: taskForm.status,
          start_date: taskForm.start_date || null,
          due_date: taskForm.due_date || null,
          completed_date:
            taskForm.status === "완료"
              ? new Date().toISOString().slice(0, 10)
              : null,
        },
      ])
      .select()
      .single();

    if (error) {
      alert(error.message);
      setIsSavingTask(false);
      return;
    }

    const nextTasks = [...tasks, data];

    await updateProjectStatus(nextTasks);

    setTasks(nextTasks);
    setTaskForm({
      task_name: "",
      task_type: "",
      assignee: "",
      start_date: "",
      due_date: "",
      status: "대기",
    });
    setShowTaskModal(false);
    setIsSavingTask(false);
  }

  async function updateTaskAssignee(taskId: number, newAssignee: string) {
    if (isUpdating) return;

    setIsUpdating(true);

    const savedAssignee = newAssignee === "미배정" ? null : newAssignee;

    const { error } = await supabase
      .from("tasks")
      .update({ assignee: savedAssignee })
      .eq("id", taskId);

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, assignee: savedAssignee } : task
      )
    );

    setIsUpdating(false);
  }

  async function updateTaskStartDate(taskId: number, newStartDate: string) {
    if (isUpdating) return;

    setIsUpdating(true);

    const savedDate = newStartDate || null;

    const { error } = await supabase
      .from("tasks")
      .update({ start_date: savedDate })
      .eq("id", taskId);

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, start_date: savedDate } : task
      )
    );

    setIsUpdating(false);
  }

  async function updateTaskDueDate(taskId: number, newDueDate: string) {
    if (isUpdating) return;

    setIsUpdating(true);

    const savedDate = newDueDate || null;

    const { error } = await supabase
      .from("tasks")
      .update({ due_date: savedDate })
      .eq("id", taskId);

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, due_date: savedDate } : task
      )
    );

    setIsUpdating(false);
  }

  async function updateTaskStatus(taskId: number, newStatus: string) {
    if (isUpdating) return;

    const targetTask = tasks.find((task) => task.id === taskId);

    if (!targetTask) {
      alert("업무 정보를 찾을 수 없습니다.");
      return;
    }

    setIsUpdating(true);

    const today = new Date().toISOString().slice(0, 10);

    const updatedTask = {
      ...targetTask,
      status: newStatus,
      completed_date: newStatus === "완료" ? today : null,
    };

    const nextTasks = tasks.map((task) =>
      task.id === taskId ? updatedTask : task
    );

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

    if (newStatus === "완료" && isShipmentTask(targetTask)) {
      await createShipmentFromTask(targetTask);
    }

    await updateProjectStatus(nextTasks);

    setTasks(nextTasks);
    setIsUpdating(false);
  }

  async function deleteTask(taskId: number) {
    if (isUpdating) return;

    const confirmed = window.confirm(
      "이 업무를 삭제할까요? 삭제된 업무는 복구할 수 없습니다."
    );

    if (!confirmed) return;

    setIsUpdating(true);

    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    const nextTasks = tasks.filter((task) => task.id !== taskId);
    const savedTasks = await saveTaskOrders(nextTasks);

    if (savedTasks) {
      await updateProjectStatus(savedTasks);
      setTasks(savedTasks);
    }

    setIsUpdating(false);
  }

  function getStatusStyle(status: string | null) {
    if (status === "완료") return "bg-green-100 text-green-700 border-green-300";
    if (status === "진행중") return "bg-blue-100 text-blue-700 border-blue-300";
    return "bg-gray-100 text-gray-700 border-gray-300";
  }

  function getProjectStatusBadge(status: string | null) {
    if (status === "완료")
      return "bg-green-100 text-green-700 border border-green-300";
    if (status === "진행중")
      return "bg-blue-100 text-blue-700 border border-blue-300";
    return "bg-gray-100 text-gray-700 border border-gray-300";
  }

  if (!project) {
    return <div className="p-8">로딩중...</div>;
  }

  const completedCount = tasks.filter((task) => task.status === "완료").length;
  const totalCount = tasks.length;
  const progress =
  totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const workingCount =
  tasks.filter((task) => task.status === "진행중").length;

  const waitingCount =
  tasks.filter((task) => task.status === "대기").length;


  return (
    <div className="p-8">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
  <div className="flex items-start justify-between gap-6">
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
          {project.project_code || "코드 없음"}
        </span>

        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${getProjectStatusBadge(
            project.status
          )}`}
        >
          {project.status || "미정"}
        </span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900">
        {project.project_name}
      </h1>

      <p className="mt-2 text-sm text-slate-500">
        {project.process_type} · 영업자 {project.salesperson || "-"} · 담당자{" "}
        {project.task_manager || "-"}
      </p>
    </div>

    <div className="w-64 rounded-2xl bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-slate-500">진행률</span>
        <span className="text-lg font-bold text-blue-600">{progress}%</span>
      </div>

      <div className="h-3 w-full rounded-full bg-slate-200">
        <div
          className="h-3 rounded-full bg-blue-600 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="mt-3 text-xs text-slate-500">
        완료 {completedCount}개 / 전체 {totalCount}개
      </p>
    </div>
  </div>
</div>
<div className="grid grid-cols-4 gap-5 mb-6">

  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-sm text-slate-500">전체 업무</p>
    <p className="mt-2 text-3xl font-bold text-slate-900">
      {totalCount}
    </p>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-sm text-slate-500">완료</p>
    <p className="mt-2 text-3xl font-bold text-green-600">
      {completedCount}
    </p>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-sm text-slate-500">진행중</p>
    <p className="mt-2 text-3xl font-bold text-blue-600">
      {workingCount}
    </p>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-sm text-slate-500">대기</p>
    <p className="mt-2 text-3xl font-bold text-amber-600">
      {waitingCount}
    </p>
  </div>

</div>
      <div className="bg-white p-6 rounded-xl shadow mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">기본정보</h2>

          {isEditingProject ? (
            <div className="flex gap-2">
              <button
                onClick={cancelProjectEdit}
                disabled={isUpdating}
                className="border px-4 py-2 rounded"
              >
                취소
              </button>

              <button
                onClick={saveProjectInfo}
                disabled={isUpdating}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
              >
                저장
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingProject(true)}
              className="bg-slate-700 text-white px-4 py-2 rounded"
            >
              프로젝트 수정
            </button>
          )}
        </div>

        {isEditingProject ? (
          <div className="grid grid-cols-2 gap-4">
            <input
              className="border p-2 rounded w-full"
              value={projectForm.project_name}
              onChange={(e) =>
                setProjectForm({ ...projectForm, project_name: e.target.value })
              }
              placeholder="프로젝트명"
            />

            <input
              className="border p-2 rounded w-full"
              value={projectForm.project_code}
              onChange={(e) =>
                setProjectForm({ ...projectForm, project_code: e.target.value })
              }
              placeholder="프로젝트코드"
            />

            <select
              className="border p-2 rounded w-full"
              value={projectForm.process_type}
              onChange={(e) =>
                setProjectForm({ ...projectForm, process_type: e.target.value })
              }
            >
              {processList.map((process) => (
                <option key={process} value={process}>
                  {process}
                </option>
              ))}
            </select>

            <span
              className={`inline-block px-3 py-2 rounded-full text-sm w-fit ${getProjectStatusBadge(
                project.status
              )}`}
            >
              {project.status || "미정"}
            </span>

            <select
              className="border p-2 rounded w-full"
              value={projectForm.salesperson}
              onChange={(e) =>
                setProjectForm({ ...projectForm, salesperson: e.target.value })
              }
            >
              <option value="">미지정</option>
              {salesList.map((sales) => (
                <option key={sales} value={sales}>
                  {sales}
                </option>
              ))}
            </select>

            <select
              className="border p-2 rounded w-full"
              value={projectForm.task_manager}
              onChange={(e) =>
                setProjectForm({ ...projectForm, task_manager: e.target.value })
              }
            >
              <option value="">미지정</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.name}>
                  {employee.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              className="border p-2 rounded w-full"
              value={projectForm.start_date}
              onChange={(e) =>
                setProjectForm({ ...projectForm, start_date: e.target.value })
              }
            />

            <input
              type="date"
              className="border p-2 rounded w-full"
              value={projectForm.completion_due_date}
              onChange={(e) =>
                setProjectForm({
                  ...projectForm,
                  completion_due_date: e.target.value,
                })
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-gray-500">프로젝트명</div>
              <div>{project.project_name}</div>
            </div>
            <div>
              <div className="text-gray-500">프로젝트코드</div>
              <div>{project.project_code || "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">공정</div>
              <div>{project.process_type}</div>
            </div>
            <div>
              <div className="text-gray-500">상태</div>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm ${getProjectStatusBadge(
                  project.status
                )}`}
              >
                {project.status || "미정"}
              </span>
            </div>
            <div>
              <div className="text-gray-500">영업자</div>
              <div>{project.salesperson || "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">업무담당자</div>
              <div>{project.task_manager || "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">시작일</div>
              <div>{project.start_date || "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">준공예정일</div>
              <div>{project.completion_due_date || "-"}</div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">업무목록</h2>

          <button
            onClick={() => setShowTaskModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            업무 추가
          </button>
        </div>

        <table className="w-full min-w-[1250px]">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left w-20">순번</th>
              <th className="p-2 text-left">업무명</th>
              <th className="p-2 text-left">업무유형</th>
              <th className="p-2 text-left">담당자</th>
              <th className="p-2 text-left">시작일</th>
              <th className="p-2 text-left">마감일</th>
              <th className="p-2 text-left">상태</th>
              <th className="p-2 text-left">완료일</th>
              <th className="p-2 text-left">관리</th>
            </tr>
          </thead>

          <tbody>
            {tasks.map((task, index) => (
             <tr
              key={task.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleTaskDrop(task.id)}
              className={`border-b ${
              draggingTaskId === task.id
                ? "opacity-40 bg-blue-50"
                : "hover:bg-gray-50"
                  }`}
                >
                <td className="p-2">{task.task_order ?? index + 1}</td>
                <td className="p-2">{task.task_name || "-"}</td>
                <td className="p-2">{task.task_type || "-"}</td>

                <td className="p-2">
                  <select
                    value={task.assignee || "미배정"}
                    disabled={isUpdating}
                    onChange={(e) =>
                      updateTaskAssignee(task.id, e.target.value)
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    className="border px-3 py-1 rounded"
                  >
                    <option value="미배정">미배정</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.name}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="p-2">
                  <input
                    type="date"
                    value={task.start_date || ""}
                    disabled={isUpdating}
                    onChange={(e) =>
                      updateTaskStartDate(task.id, e.target.value)
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    className="border px-2 py-1 rounded"
                  />
                </td>

                <td className="p-2">
                  <input
                    type="date"
                    value={task.due_date || ""}
                    disabled={isUpdating}
                    onChange={(e) =>
                      updateTaskDueDate(task.id, e.target.value)
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    className="border px-2 py-1 rounded"
                  />
                </td>

                <td className="p-2">
                  <select
                    value={task.status || "대기"}
                    disabled={isUpdating}
                    onChange={(e) =>
                      updateTaskStatus(task.id, e.target.value)
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`border px-3 py-1 rounded ${getStatusStyle(
                      task.status
                    )}`}
                  >
                    {statusList.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="p-2">{task.completed_date || "-"}</td>

                <td className="p-2">
                  <div className="flex gap-1">
                   <span
                    draggable={!isUpdating}
                    onDragStart={() => setDraggingTaskId(task.id)}
                    onDragEnd={() => setDraggingTaskId(null)}
                    className="border px-2 py-1 rounded text-gray-500 cursor-grab select-none"
                    title="드래그해서 순서 변경"
                      >
                        ☰
                        </span>

                    <button
                      onClick={() => duplicateTask(task)}
                      disabled={isUpdating}
                      className="border px-3 py-1 rounded text-blue-600 disabled:text-gray-400"
                    >
                      복제
                    </button>

                    <button
                      onClick={() => deleteTask(task.id)}
                      disabled={isUpdating}
                      className="border px-3 py-1 rounded text-red-600 disabled:text-gray-400"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {tasks.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500">
                  등록된 업무가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-[560px]">
            <h2 className="text-2xl font-bold mb-5">업무 추가</h2>

            <div className="space-y-3">
              <input
                className="border w-full p-2 rounded"
                placeholder="업무명"
                value={taskForm.task_name}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, task_name: e.target.value })
                }
              />

              <input
                className="border w-full p-2 rounded"
                placeholder="업무유형"
                value={taskForm.task_type}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, task_type: e.target.value })
                }
              />

              <select
                className="border w-full p-2 rounded"
                value={taskForm.assignee || "미배정"}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, assignee: e.target.value })
                }
              >
                <option value="미배정">미배정</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.name}>
                    {employee.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                className="border w-full p-2 rounded"
                value={taskForm.start_date}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, start_date: e.target.value })
                }
              />

              <input
                type="date"
                className="border w-full p-2 rounded"
                value={taskForm.due_date}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, due_date: e.target.value })
                }
              />

              <select
                className="border w-full p-2 rounded"
                value={taskForm.status}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, status: e.target.value })
                }
              >
                {statusList.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowTaskModal(false)}
                disabled={isSavingTask}
                className="border px-4 py-2 rounded"
              >
                취소
              </button>

              <button
                onClick={addTask}
                disabled={isSavingTask}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
              >
                {isSavingTask ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}