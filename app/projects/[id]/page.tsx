"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, GripVertical, Plus, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addActivity } from "@/lib/activity";
import { normalizeAssemblyVendor } from "@/lib/projects";
import {
  addFavoriteProject,
  getRecentUserScope,
  isFavoriteProject,
  recordRecentProject,
  recordRecentTask,
  removeFavoriteProject,
} from "@/lib/recent";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ProjectFiles } from "@/components/files/ProjectFiles";
import {
  getProjectStatusLabel,
  getTaskStatusLabel,
  isTaskCompleted,
  isTaskInProgress,
  isTaskPending,
  normalizeProjectStatus,
  normalizeTaskStatus,
} from "@/lib/status";

type Project = {
  id: number;
  project_code: string | null;
  project_name: string;
  client_name: string | null;
  assembly_vendor: string | null;
  process_type: string;
  salesperson: string | null;
  site_address: string | null;
  task_manager: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
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

const statusList = ["pending", "in_progress", "completed"];
const processList = ["MH", "SH", "AS", "본관-문화", "본관-제어"];
const salesList = ["이승민", "안성준", "고민규", "박석보"];

export default function ProjectDetail() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [favoriteUserScope, setFavoriteUserScope] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  const [projectForm, setProjectForm] = useState({
    project_code: "",
    project_name: "",
    client_name: "",
    assembly_vendor: "",
    process_type: "",
    salesperson: "",
    site_address: "",
    task_manager: "",
    start_date: "",
    end_date: "",
  });

  const [taskForm, setTaskForm] = useState({
    task_name: "",
    task_type: "",
    assignee: "",
    start_date: "",
    due_date: "",
    status: "pending",
  });


  const loadProject = useCallback(async function loadProject() {
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
      client_name: projectData.client_name || "",
      assembly_vendor: projectData.assembly_vendor || "",
      process_type: projectData.process_type || "",
      salesperson: projectData.salesperson || "",
      site_address: projectData.site_address || "",
      task_manager: projectData.task_manager || "",
      start_date: projectData.start_date || "",
      end_date: projectData.end_date || projectData.completion_due_date || "",
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
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    const timer = window.setTimeout(() => {
      void loadProject();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [projectId, loadProject]);

  useEffect(() => {
    let isMounted = true;

    async function loadFavoriteScope() {
      const scope = await getRecentUserScope();

      if (!isMounted) return;

      setFavoriteUserScope(scope);
      setIsFavorite(scope ? isFavoriteProject(scope, Number(projectId)) : false);
    }

    void loadFavoriteScope();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project) return;

    void recordRecentProject({
      project_id: project.id,
      project_name: project.project_name,
      project_code: project.project_code,
      assembly_vendor: project.assembly_vendor,
      status: project.status,
    });

    if (favoriteUserScope && isFavorite) {
      addFavoriteProject(favoriteUserScope, {
        project_id: project.id,
        project_name: project.project_name,
        project_code: project.project_code,
        assembly_vendor: project.assembly_vendor,
        status: project.status,
      });
    }
  }, [favoriteUserScope, isFavorite, project]);

  function toggleFavoriteProject() {
    if (!project || !favoriteUserScope) return;

    if (isFavorite) {
      removeFavoriteProject(favoriteUserScope, project.id);
      setIsFavorite(false);
      return;
    }

    const saved = addFavoriteProject(favoriteUserScope, {
      project_id: project.id,
      project_name: project.project_name,
      project_code: project.project_code,
      assembly_vendor: project.assembly_vendor,
      status: project.status,
    });

    if (saved) {
      setIsFavorite(true);
    }
  }

  function recordTaskChange(task: Task) {
    if (!project) return;

    void recordRecentTask({
      task_id: task.id,
      project_id: task.project_id,
      project_name: project.project_name,
      task_name: task.task_name,
      task_type: task.task_type,
      assignee: task.assignee,
      status: task.status,
      due_date: task.due_date,
    });
  }

  function isShipmentTask(task: Task) {
    return (task.task_type || "").includes("출고");
  }

  function getNextShipmentTask(completedTask: Task, candidateTasks: Task[]) {
    if (isShipmentTask(completedTask)) return null;

    const orderedTasks = [...candidateTasks].sort((a, b) => {
      const orderA = a.task_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.task_order ?? Number.MAX_SAFE_INTEGER;

      if (orderA !== orderB) return orderA - orderB;

      return a.id - b.id;
    });
    const completedTaskIndex = orderedTasks.findIndex(
      (task) => task.id === completedTask.id
    );

    if (completedTaskIndex === -1) return null;

    const nextTask = orderedTasks[completedTaskIndex + 1];

    return nextTask && isShipmentTask(nextTask) ? nextTask : null;
  }

  async function saveShipmentFromTask(
    task: Task,
    status: "출고대기" | "출고완료",
    today: string
  ) {
    if (!project) return;

    const { data: existingShipment, error: existingError } = await supabase
      .from("shipments")
      .select("id, status")
      .eq("task_id", task.id)
      .maybeSingle();

    if (existingError) {
      alert(existingError.message);
      return;
    }

    if (existingShipment) {
      if (existingShipment.status === "출고완료" && status === "출고대기") return;

      const { error: updateError } = await supabase
        .from("shipments")
        .update({
          status,
          shipment_date: status === "출고완료" ? today : null,
        })
        .eq("id", existingShipment.id);

      if (updateError) {
        alert(updateError.message);
      }

      return;
    }

    if (status === "출고완료") {
      const { data: waitingShipment, error: waitingError } = await supabase
        .from("shipments")
        .select("id")
        .eq("project_id", project.id)
        .or("status.is.null,status.eq.출고대기")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (waitingError) {
        alert(waitingError.message);
        return;
      }

      if (waitingShipment) {
        const { error: updateWaitingError } = await supabase
          .from("shipments")
          .update({
            task_id: task.id,
            status,
            shipment_date: today,
          })
          .eq("id", waitingShipment.id);

        if (updateWaitingError) {
          alert(updateWaitingError.message);
        }

        return;
      }
    }

    const { error: shipmentError } = await supabase.from("shipments").insert([
      {
        project_id: project.id,
        task_id: task.id,
        site_name: project.project_name,
        item_name: task.task_name || "출고항목",
        quantity: null,
        shipment_date: status === "출고완료" ? today : null,
        vehicle_number: null,
        driver_name: null,
        driver_phone: null,
        destination: null,
        receiver: null,
        status,
        memo:
          status === "출고완료"
            ? `${task.task_name || ""} ${task.task_type || ""} 업무 완료로 출고완료 처리`
            : `${task.task_name || ""} ${task.task_type || ""} 이전 단계 완료로 출고대기 생성`,
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
        client_name: projectForm.client_name.trim() || null,
        assembly_vendor: normalizeAssemblyVendor(projectForm.assembly_vendor),
        process_type: projectForm.process_type,
        salesperson: projectForm.salesperson || null,
        site_address: projectForm.site_address.trim() || null,
        task_manager: projectForm.task_manager || null,
        start_date: projectForm.start_date || null,
        end_date: projectForm.end_date || null,
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
      client_name: project.client_name || "",
      assembly_vendor: project.assembly_vendor || "",
      process_type: project.process_type || "",
      salesperson: project.salesperson || "",
      site_address: project.site_address || "",
      task_manager: project.task_manager || "",
      start_date: project.start_date || "",
      end_date: project.end_date || project.completion_due_date || "",
    });

    setIsEditingProject(false);
  }

  async function updateProjectStatus(nextTasks: Task[]) {
    if (!project) return;

    let nextProjectStatus = "pending";

    if (nextTasks.length > 0) {
      const isAllCompleted = nextTasks.every((task) =>
        isTaskCompleted(task.status)
      );
      const hasActiveOrCompleted = nextTasks.some(
        (task) => isTaskInProgress(task.status) || isTaskCompleted(task.status)
      );

      if (isAllCompleted) nextProjectStatus = "completed";
      else if (hasActiveOrCompleted) nextProjectStatus = "in_progress";
    }

    if (normalizeProjectStatus(project.status) === nextProjectStatus) return;

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
          status: "pending",
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
            isTaskCompleted(taskForm.status)
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
    recordTaskChange(data as Task);
    setTaskForm({
      task_name: "",
      task_type: "",
      assignee: "",
      start_date: "",
      due_date: "",
      status: "pending",
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

    const targetTask = tasks.find((task) => task.id === taskId);
    const updatedTask = targetTask
      ? { ...targetTask, assignee: savedAssignee }
      : null;

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId && updatedTask ? updatedTask : task))
    );

    if (updatedTask) {
      recordTaskChange(updatedTask);
    }

    setIsUpdating(false);
  }

  // 시작일은 상세 업무 목록 UI에서 숨기지만 기존 저장 로직은 유지합니다.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    const targetTask = tasks.find((task) => task.id === taskId);
    const updatedTask = targetTask
      ? { ...targetTask, start_date: savedDate }
      : null;

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId && updatedTask ? updatedTask : task))
    );

    if (updatedTask) {
      recordTaskChange(updatedTask);
    }

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

    const targetTask = tasks.find((task) => task.id === taskId);
    const updatedTask = targetTask ? { ...targetTask, due_date: savedDate } : null;

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId && updatedTask ? updatedTask : task))
    );

    if (updatedTask) {
      recordTaskChange(updatedTask);
    }

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
      completed_date: isTaskCompleted(newStatus) ? today : null,
    };

    const nextTasks = tasks.map((task) =>
      task.id === taskId ? updatedTask : task
    );

    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_date: isTaskCompleted(newStatus) ? today : null,
      })
      .eq("id", taskId);

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    if (isTaskCompleted(newStatus)) {
  await addActivity({
    actionType: "task_complete",
    targetType: "task",
    targetId: targetTask.id,
    projectId: targetTask.project_id,
    title: "업무 완료",
    description: `${project?.project_name || ""} - ${
      targetTask.task_name || "업무"
    }`,
  });
}

    if (isTaskCompleted(newStatus)) {
      if (isShipmentTask(targetTask)) {
        await saveShipmentFromTask(targetTask, "출고완료", today);
      } else {
        const nextShipmentTask = getNextShipmentTask(updatedTask, nextTasks);

        if (nextShipmentTask) {
          await saveShipmentFromTask(nextShipmentTask, "출고대기", today);
        }
      }
    }

    await updateProjectStatus(nextTasks);

    setTasks(nextTasks);
    recordTaskChange(updatedTask);
    setIsUpdating(false);
  }

  async function deleteTask(taskId: number) {
    if (isUpdating) return;

    const confirmed = window.confirm(
      "이 업무를 삭제할까요? 삭제한 업무는 복구할 수 없습니다."
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
    if (isTaskCompleted(status))
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (isTaskInProgress(status))
      return "border-blue-200 bg-blue-50 text-blue-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  function getDueDateBadge(task: Task) {
    if (isTaskCompleted(task.status) || !task.due_date) return null;

    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(task.due_date);
    const todayDate = new Date(today);
    const diffDays = Math.ceil(
      (dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return {
        label: "오늘",
        variant: "warning" as BadgeVariant,
      };
    }

    if (diffDays > 0) {
      return {
        label: `D-${diffDays}`,
        variant: "default" as BadgeVariant,
      };
    }

    return {
      label: `지연 ${Math.abs(diffDays)}일`,
      variant: "danger" as BadgeVariant,
    };
  }

  function getProjectStatusBadgeVariant(status: string | null): BadgeVariant {
    const statusValue = normalizeProjectStatus(status);

    if (statusValue === "completed") return "success";
    if (statusValue === "in_progress") return "info";
    if (statusValue === "hold") return "warning";
    return "default";
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-500">
        로딩중...
      </div>
    );
  }

  const completedCount = tasks.filter((task) =>
    isTaskCompleted(task.status)
  ).length;
  const totalCount = tasks.length;
  const progress =
  totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const workingCount =
  tasks.filter((task) => isTaskInProgress(task.status)).length;

  const waitingCount =
  tasks.filter((task) => isTaskPending(task.status)).length;

  const today = new Date().toISOString().slice(0, 10);
  const incompleteTasks = tasks.filter((task) => !isTaskCompleted(task.status));
  const delayedTaskCount = incompleteTasks.filter(
    (task) => task.due_date !== null && task.due_date < today
  ).length;
  const todayTaskCount = incompleteTasks.filter(
    (task) => task.start_date === today || task.due_date === today
  ).length;
  const remainingTaskCount = totalCount - completedCount;
  const nextDueTask =
    incompleteTasks
      .filter((task) => task.due_date !== null)
      .sort((a, b) => {
        const aDueDate = a.due_date || "";
        const bDueDate = b.due_date || "";

        return aDueDate.localeCompare(bDueDate);
      })[0] || null;
  const nextDueDate = nextDueTask?.due_date || null;

  const projectEndDate = project.end_date || project.completion_due_date;
  const isProjectInfoExpanded = isProjectInfoOpen || isEditingProject;

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-7 text-slate-900 lg:px-8">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="default" className="text-sm font-medium">
                {project.project_code || "코드 없음"}
              </Badge>
              <Badge
                variant={getProjectStatusBadgeVariant(project.status)}
                className="text-sm font-medium"
              >
                {getProjectStatusLabel(project.status)}
              </Badge>
              <button
                type="button"
                onClick={toggleFavoriteProject}
                disabled={!favoriteUserScope}
                aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                title={
                  favoriteUserScope
                    ? isFavorite
                      ? "즐겨찾기 해제"
                      : "즐겨찾기 추가"
                    : "로그인 사용자 확인 후 사용할 수 있습니다"
                }
                className={`flex h-8 w-8 items-center justify-center rounded-2xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isFavorite
                    ? "border-amber-200 bg-amber-50 text-amber-500"
                    : "border-slate-200 bg-white text-slate-400 hover:text-amber-500"
                }`}
              >
                <Star
                  size={16}
                  className={isFavorite ? "fill-current" : ""}
                />
              </button>
            </div>

            <h1 className="truncate text-3xl font-bold tracking-tight text-slate-950">
              {project.project_name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {project.process_type} · 발주처 {project.client_name || "-"} · 조립처{" "}
              {project.assembly_vendor || "-"} · 영업자 {project.salesperson || "-"} ·
              담당자 {project.task_manager || "-"}
            </p>
          </div>

          <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:w-72">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">진행률</span>
              <span className="text-xl font-bold tracking-tight text-blue-600">
                {progress}%
              </span>
            </div>
            <ProgressBar percent={progress} className="h-2 w-full" />
            <p className="mt-2 text-xs text-slate-500">
              완료 {completedCount}개 / 전체 {totalCount}개
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setIsProjectInfoOpen((prev) => !prev)}
          className="flex w-full items-start justify-between gap-4 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isProjectInfoExpanded ? (
                <ChevronDown size={18} className="text-slate-400" />
              ) : (
                <ChevronRight size={18} className="text-slate-400" />
              )}
              <h2 className="text-lg font-bold tracking-tight text-slate-950">
                프로젝트 정보
              </h2>
            </div>
            {!isProjectInfoExpanded && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span className="font-medium text-slate-700">
                  {project.project_name}
                </span>
                <Badge
                  variant={getProjectStatusBadgeVariant(project.status)}
                  className="px-2 py-0.5"
                >
                  {getProjectStatusLabel(project.status)}
                </Badge>
                <span>종료일 {projectEndDate || "-"}</span>
              </div>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            {isProjectInfoExpanded ? "접기" : "펼치기"}
          </span>
        </button>

        {isProjectInfoExpanded && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="mb-4 flex justify-end">
              {isEditingProject ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={cancelProjectEdit}
                    disabled={isUpdating}
                    className="rounded-2xl px-4 py-2 text-sm"
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    onClick={saveProjectInfo}
                    disabled={isUpdating}
                    className="rounded-2xl px-4 py-2 text-sm"
                  >
                    저장
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => setIsEditingProject(true)}
                  className="rounded-2xl border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
                >
                  프로젝트 수정
                </Button>
              )}
            </div>

            {isEditingProject ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <input
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  value={projectForm.project_name}
                  onChange={(e) =>
                    setProjectForm({ ...projectForm, project_name: e.target.value })
                  }
                  placeholder="프로젝트명"
                />
                <input
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  value={projectForm.project_code}
                  onChange={(e) =>
                    setProjectForm({ ...projectForm, project_code: e.target.value })
                  }
                  placeholder="프로젝트코드"
                />
                <input
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  value={projectForm.client_name}
                  onChange={(e) =>
                    setProjectForm({ ...projectForm, client_name: e.target.value })
                  }
                  placeholder="발주처"
                />
                <input
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  value={projectForm.assembly_vendor}
                  onChange={(e) =>
                    setProjectForm({
                      ...projectForm,
                      assembly_vendor: e.target.value,
                    })
                  }
                  placeholder="조립처"
                />
                <select
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
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
                <div className="flex h-10 items-center">
                  <Badge
                    variant={getProjectStatusBadgeVariant(project.status)}
                    className="inline-block text-sm"
                  >
                    {getProjectStatusLabel(project.status)}
                  </Badge>
                </div>
                <input
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  value={projectForm.site_address}
                  onChange={(e) =>
                    setProjectForm({ ...projectForm, site_address: e.target.value })
                  }
                  placeholder="현장주소"
                />
                <select
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
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
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
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
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  value={projectForm.start_date}
                  onChange={(e) =>
                    setProjectForm({ ...projectForm, start_date: e.target.value })
                  }
                />
                <input
                  type="date"
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  value={projectForm.end_date}
                  onChange={(e) =>
                    setProjectForm({
                      ...projectForm,
                      end_date: e.target.value,
                    })
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["프로젝트명", project.project_name],
                  ["프로젝트코드", project.project_code || "-"],
                  ["공정", project.process_type],
                  ["발주처", project.client_name || "-"],
                  ["조립처", project.assembly_vendor || "-"],
                  ["영업자", project.salesperson || "-"],
                  ["현장주소", project.site_address || "-"],
                  ["업무담당자", project.task_manager || "-"],
                  ["시작일", project.start_date || "-"],
                  ["종료일", projectEndDate || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">
                      {label}
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900">
                      {value}
                    </div>
                  </div>
                ))}
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-medium text-slate-500">상태</div>
                  <Badge
                    variant={getProjectStatusBadgeVariant(project.status)}
                    className="mt-1 inline-block text-sm"
                  >
                    {getProjectStatusLabel(project.status)}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              Project Overview
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              진행률과 주요 일정 리스크를 요약합니다.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
            {progress}%
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.6fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">전체 진행률</span>
              <span className="text-2xl font-bold tracking-tight text-blue-600">
                {progress}%
              </span>
            </div>
            <ProgressBar percent={progress} className="h-2 w-full" />
            <p className="mt-3 text-xs text-slate-500">
              완료 {completedCount}개 / 전체 {totalCount}개
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["전체", totalCount, "text-slate-950"],
              ["완료", completedCount, "text-emerald-600"],
              ["남은", remainingTaskCount, "text-slate-700"],
              ["진행중", workingCount, "text-blue-600"],
              ["대기", waitingCount, "text-amber-600"],
              ["오늘", todayTaskCount, "text-orange-600"],
              ["지연", delayedTaskCount, "text-red-600"],
            ].map(([label, value, colorClass]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-3"
              >
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold tracking-tight ${colorClass}`}>
                  {value}
                </p>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-500">다음 마감</p>
              <p className="mt-1 truncate text-base font-bold text-slate-950">
                {nextDueDate || "예정 없음"}
              </p>
              {nextDueTask && (
                <p className="mt-1 truncate text-xs text-slate-500">
                  {nextDueTask.task_name || "업무명 없음"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              업무목록
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              담당자, 일정, 상태를 한 화면에서 관리합니다.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowTaskModal(true)}
            className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            업무 추가
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs font-semibold leading-none text-slate-500">
                <th className="w-[5%] px-2 py-2.5 text-left">순번</th>
                <th className="w-[25%] px-2 py-2.5 text-left">업무명</th>
                <th className="w-[12%] px-2 py-2.5 text-left">업무유형</th>
                <th className="w-[12%] px-2 py-2.5 text-left">담당자</th>
                <th className="w-[19%] px-2 py-2.5 text-left">일정</th>
                <th className="w-[9%] px-2 py-2.5 text-left">상태</th>
                <th className="w-[8%] px-2 py-2.5 text-left">완료일</th>
                <th className="w-[10%] px-2 py-2.5 text-left">관리</th>
              </tr>
            </thead>

            <tbody>
              {tasks.map((task, index) => {
                const dueDateBadge = getDueDateBadge(task);

                return (
                  <tr
                    key={task.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleTaskDrop(task.id)}
                    className={`border-b border-slate-100 transition-colors ${
                      draggingTaskId === task.id
                        ? "bg-blue-50 opacity-50"
                        : isTaskCompleted(task.status)
                          ? "text-slate-500 hover:bg-slate-50"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-2 py-2 align-middle text-xs font-medium text-slate-400">
                      {task.task_order ?? index + 1}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div
                        className={`truncate font-semibold leading-5 ${
                          isTaskCompleted(task.status)
                            ? "text-slate-500"
                            : "text-slate-950"
                        }`}
                        title={task.task_name || "-"}
                      >
                        {task.task_name || "-"}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div className="truncate text-sm leading-5 text-slate-600" title={task.task_type || "-"}>
                        {task.task_type || "-"}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <select
                        value={task.assignee || "미배정"}
                        disabled={isUpdating}
                        onChange={(e) =>
                          updateTaskAssignee(task.id, e.target.value)
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                        className="h-8 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white disabled:bg-slate-100"
                      >
                        <option value="미배정">미배정</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.name}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1">
                        <input
                          type="date"
                          value={task.due_date || ""}
                          disabled={isUpdating}
                          onChange={(e) =>
                            updateTaskDueDate(task.id, e.target.value)
                          }
                          onMouseDown={(e) => e.stopPropagation()}
                          className="h-7 w-32 rounded-lg border border-transparent bg-transparent px-1.5 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white disabled:text-slate-400"
                        />
                        {dueDateBadge && (
                          <Badge
                            variant={dueDateBadge.variant}
                            className="whitespace-nowrap px-2 py-0.5 font-semibold"
                          >
                            {dueDateBadge.label}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <select
                        value={normalizeTaskStatus(task.status) || "pending"}
                        disabled={isUpdating}
                        onChange={(e) =>
                          updateTaskStatus(task.id, e.target.value)
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`h-8 w-full rounded-xl border px-2 text-sm font-medium outline-none transition-colors focus:border-blue-300 focus:bg-white disabled:bg-slate-100 ${getStatusStyle(
                          task.status
                        )}`}
                      >
                        {statusList.map((status) => (
                          <option key={status} value={status}>
                            {getTaskStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 align-middle text-xs text-slate-400">
                      {task.completed_date || "-"}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div className="flex flex-nowrap items-center gap-1">
                        <span
                          draggable={!isUpdating}
                          onDragStart={() => setDraggingTaskId(task.id)}
                          onDragEnd={() => setDraggingTaskId(null)}
                          className="flex h-8 w-8 cursor-grab select-none items-center justify-center rounded-xl border border-transparent bg-transparent text-slate-300 transition-colors hover:border-slate-200 hover:bg-white hover:text-slate-500"
                          title="드래그해서 순서 변경"
                        >
                          <GripVertical size={14} />
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => duplicateTask(task)}
                          disabled={isUpdating}
                          className="rounded-xl border-slate-200 px-2.5 py-1 text-xs font-medium text-blue-600 hover:border-blue-200 hover:bg-blue-50 disabled:text-gray-400"
                        >
                          복제
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deleteTask(task.id)}
                          disabled={isUpdating}
                          className="rounded-xl border-red-100 px-2.5 py-1 text-xs font-medium hover:bg-red-50"
                        >
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {tasks.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-0">
                    <EmptyState
                      message="등록된 업무가 없습니다."
                      className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProjectFiles projectId={projectId} />

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-5">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">
                업무 추가
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                업무명, 유형, 담당자와 일정을 입력합니다.
              </p>
            </div>

            <div className="space-y-3">
              <input
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                placeholder="업무명"
                value={taskForm.task_name}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, task_name: e.target.value })
                }
              />
              <input
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                placeholder="업무유형"
                value={taskForm.task_type}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, task_type: e.target.value })
                }
              />
              <select
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
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
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                value={taskForm.start_date}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, start_date: e.target.value })
                }
              />
              <input
                type="date"
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                value={taskForm.due_date}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, due_date: e.target.value })
                }
              />
              <select
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                value={taskForm.status}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, status: e.target.value })
                }
              >
                {statusList.map((status) => (
                  <option key={status} value={status}>
                    {getTaskStatusLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowTaskModal(false)}
                disabled={isSavingTask}
                className="rounded-2xl px-4 py-2 text-sm"
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={addTask}
                disabled={isSavingTask}
                className="rounded-2xl px-4 py-2 text-sm"
              >
                {isSavingTask ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
