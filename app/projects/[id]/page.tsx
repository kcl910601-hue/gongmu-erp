"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, GripVertical, Plus, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addActivity } from "@/lib/activity";
import {
  createAuditChanges,
  PROJECT_AUDIT_FIELDS,
  TASK_AUDIT_FIELDS,
} from "@/lib/audit";
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditableCombobox } from "@/components/ui/EditableCombobox";
import { ProjectFiles } from "@/components/files/ProjectFiles";
import ActivityTimeline from "@/components/activity/ActivityTimeline";
import ProjectTimeline from "@/components/activity/ProjectTimeline";
import { ProjectSectionDialog, type ProjectSectionDialogValue } from "@/components/projects/ProjectSectionDialog";
import { getAllProcessTypes } from "@/lib/process-types";
import {
  calculateSectionProgress,
  createProjectSectionWithTasks,
  deleteProjectSectionWithTasks,
  getComputedSectionStatus,
  getProjectSections,
} from "@/lib/project-sections";
import { toast } from "@/lib/toast";
import { getProjectEntryOptions } from "@/lib/project-master-data";
import type { ProcessType } from "@/types/process-type";
import type { ProjectSection } from "@/types/project-section";
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
  project_section_id?: number | null;
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

export default function ProjectDetail() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<ProjectSection[]>([]);
  const [processTypes, setProcessTypes] = useState<ProcessType[]>([]);
  const [openSectionIds, setOpenSectionIds] = useState<Set<number>>(new Set());
  const [selectedTaskSectionId, setSelectedTaskSectionId] = useState<number | null>(null);
  const [sectionDialog, setSectionDialog] = useState<{ mode: "add" | "edit"; source: ProjectSection | null; target: ProjectSection | null } | null>(null);
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [sectionPendingDelete, setSectionPendingDelete] = useState<{
    section: ProjectSection;
    taskCount: number;
    completedCount: number;
  } | null>(null);
  const [isDeletingSection, setIsDeletingSection] = useState(false);
  const [salespersonOptions, setSalespersonOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [assemblyVendorOptions, setAssemblyVendorOptions] = useState<string[]>([]);
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

    const [sectionResult, processTypeResult, entryOptionResult] = await Promise.all([
      getProjectSections(Number(projectId)),
      getAllProcessTypes(),
      getProjectEntryOptions(),
    ]);
    if (sectionResult.error || processTypeResult.error) {
      alert(sectionResult.error?.message || processTypeResult.error?.message || "공정 정보를 불러오지 못했습니다.");
      return;
    }
    const sortedSections = [...sectionResult.data].sort((a, b) => {
      const aType = processTypeResult.data.find((item) => item.code === a.process_type);
      const bType = processTypeResult.data.find((item) => item.code === b.process_type);
      return (aType?.sort_order ?? a.sort_order) - (bType?.sort_order ?? b.sort_order)
        || (aType?.name ?? a.process_type).localeCompare(bType?.name ?? b.process_type, "ko-KR")
        || a.created_at.localeCompare(b.created_at);
    });
    setSections(sortedSections);
    setProcessTypes(processTypeResult.data);
    if (entryOptionResult.error) {
      console.error("project entry options error:", entryOptionResult.error);
    }
    setSalespersonOptions(entryOptionResult.data.salespeople);
    setAssemblyVendorOptions(entryOptionResult.data.assemblyVendors);
    setOpenSectionIds((current) => current.size > 0 ? current : new Set(sortedSections[0] ? [sortedSections[0].id] : []));

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
      return;
    }

    if (status === "출고대기") {
      await addActivity({
        type: "shipment_create",
        title: "출고 생성",
        description: `${task.task_name || "출고 업무"}에 대한 출고 대기를 생성했습니다.`,
        projectId: project.id,
        targetType: "shipment",
        metadata: { taskId: task.id },
      });
    }
  }

  async function saveProjectInfo() {
    if (!project || isUpdating) return;

    if (!projectForm.project_code.trim() || !projectForm.project_name.trim()) {
      alert("프로젝트코드와 프로젝트명은 필수입니다.");
      return;
    }

    setIsUpdating(true);

    const nextProjectData = {
      project_code: projectForm.project_code.trim(),
      project_name: projectForm.project_name.trim(),
      client_name: projectForm.client_name.trim() || null,
      assembly_vendor: normalizeAssemblyVendor(projectForm.assembly_vendor),
      process_type: projectForm.process_type,
      salesperson: projectForm.salesperson.trim() || null,
      site_address: projectForm.site_address.trim() || null,
      task_manager: projectForm.task_manager || null,
      start_date: projectForm.start_date || null,
      end_date: projectForm.end_date || null,
    };
    const changes = createAuditChanges(
      project as unknown as Record<string, unknown>,
      nextProjectData,
      PROJECT_AUDIT_FIELDS
    );

    if (changes.length === 0) {
      setIsEditingProject(false);
      setIsUpdating(false);
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .update(nextProjectData)
      .eq("id", project.id)
      .select()
      .single();

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    setProject(data);
    await addActivity({
      type: "project_update",
      title: `프로젝트 수정 · ${changes.length}개 항목 변경`,
      description: `${data.project_name} 프로젝트 정보를 수정했습니다.`,
      projectId: data.id,
      targetType: "project",
      targetId: data.id,
      metadata: { changes },
    });
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

    const changes = createAuditChanges(
      project as unknown as Record<string, unknown>,
      { ...project, status: nextProjectStatus } as unknown as Record<
        string,
        unknown
      >,
      PROJECT_AUDIT_FIELDS
    );
    await addActivity({
      type: "project_update",
      title: `프로젝트 수정 · ${changes.length}개 항목 변경`,
      description: `${project.project_name} 프로젝트 상태가 변경되었습니다.`,
      projectId: project.id,
      targetType: "project",
      targetId: project.id,
      metadata: { changes },
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
      const savedDraggedTask = savedTasks.find(
        (task) => task.id === draggedTask.id
      );
      const previousDraggedTask = tasks.find(
        (task) => task.id === draggedTask.id
      );

      if (savedDraggedTask && previousDraggedTask) {
        const changes = createAuditChanges(
          previousDraggedTask as unknown as Record<string, unknown>,
          savedDraggedTask as unknown as Record<string, unknown>,
          TASK_AUDIT_FIELDS
        );

        if (changes.length > 0) {
          await addActivity({
            type: "task_update",
            title: `업무 수정 · ${changes.length}개 항목 변경`,
            description: `${savedDraggedTask.task_name || "업무"} 순서를 변경했습니다.`,
            projectId: savedDraggedTask.project_id,
            targetType: "task",
            targetId: savedDraggedTask.id,
            metadata: { changes },
          });
        }
      }
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
          project_section_id: task.project_section_id ?? null,
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

    await addActivity({
      type: "task_create",
      title: "업무 생성",
      description: `${data.task_name || "업무"}을(를) 생성했습니다.`,
      projectId: project.id,
      targetType: "task",
      targetId: data.id,
    });

    setIsUpdating(false);
  }

  async function addTask() {
    if (!project || !selectedTaskSectionId || isSavingTask) return;

    if (!taskForm.task_name.trim()) {
      alert("업무명을 입력하세요.");
      return;
    }

    if (!taskForm.task_type.trim()) {
      alert("업무유형을 입력하세요.");
      return;
    }

    setIsSavingTask(true);

    const sectionTasks = tasks.filter((task) => task.project_section_id === selectedTaskSectionId);
    const maxOrder =
      sectionTasks.length > 0
        ? Math.max(...sectionTasks.map((task) => task.task_order || 0))
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
          project_section_id: selectedTaskSectionId,
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
    await addActivity({
      type: "task_create",
      title: "업무 생성",
      description: `${data.task_name || "업무"}을(를) 생성했습니다.`,
      projectId: project.id,
      targetType: "task",
      targetId: data.id,
    });
    setTaskForm({
      task_name: "",
      task_type: "",
      assignee: "",
      start_date: "",
      due_date: "",
      status: "pending",
    });
    setShowTaskModal(false);
    setOpenSectionIds((current) => new Set(current).add(selectedTaskSectionId));
    setSelectedTaskSectionId(null);
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
      const changes = createAuditChanges(
        targetTask as unknown as Record<string, unknown>,
        updatedTask as unknown as Record<string, unknown>,
        TASK_AUDIT_FIELDS
      );
      recordTaskChange(updatedTask);
      await addActivity({
        type: "task_assignee_change",
        description: `${updatedTask.task_name || "업무"} 담당자를 ${
          savedAssignee || "미배정"
        }(으)로 변경했습니다.`,
        projectId: updatedTask.project_id,
        targetType: "task",
        targetId: updatedTask.id,
        title: `업무 담당자 변경 · ${changes.length}개 항목 변경`,
        metadata: { assignee: savedAssignee, changes },
      });
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
      const changes = createAuditChanges(
        targetTask as unknown as Record<string, unknown>,
        updatedTask as unknown as Record<string, unknown>,
        TASK_AUDIT_FIELDS
      );
      recordTaskChange(updatedTask);
      await addActivity({
        type: "task_update",
        title: `업무 수정 · ${changes.length}개 항목 변경`,
        description: `${updatedTask.task_name || "업무"} 시작일을 변경했습니다.`,
        projectId: updatedTask.project_id,
        targetType: "task",
        targetId: updatedTask.id,
        metadata: { changes },
      });
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
      const changes = createAuditChanges(
        targetTask as unknown as Record<string, unknown>,
        updatedTask as unknown as Record<string, unknown>,
        TASK_AUDIT_FIELDS
      );
      recordTaskChange(updatedTask);
      await addActivity({
        type: "task_update",
        title: `업무 수정 · ${changes.length}개 항목 변경`,
        description: `${updatedTask.task_name || "업무"} 마감일을 변경했습니다.`,
        projectId: updatedTask.project_id,
        targetType: "task",
        targetId: updatedTask.id,
        metadata: { changes },
      });
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

    const changes = createAuditChanges(
      targetTask as unknown as Record<string, unknown>,
      updatedTask as unknown as Record<string, unknown>,
      TASK_AUDIT_FIELDS
    );

    await addActivity({
      type: isTaskCompleted(newStatus) ? "task_complete" : "task_status_change",
      targetType: "task",
      targetId: targetTask.id,
      projectId: targetTask.project_id,
      title: `${
        isTaskCompleted(newStatus) ? "업무 완료" : "업무 상태 변경"
      } · ${changes.length}개 항목 변경`,
      description: `${targetTask.task_name || "업무"} 상태를 ${newStatus}(으)로 변경했습니다.`,
      metadata: {
        previousStatus: targetTask.status,
        nextStatus: newStatus,
        changes,
      },
    });

    if (isTaskCompleted(newStatus) && isShipmentTask(targetTask)) {
      await addActivity({
        type: "shipment_complete",
        title: "출고 완료",
        description: `${targetTask.task_name || "출고 업무"} 완료로 출고를 완료했습니다.`,
        projectId: targetTask.project_id,
        targetType: "shipment",
        metadata: { taskId: targetTask.id },
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

    const targetTask = tasks.find((task) => task.id === taskId);
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

    await addActivity({
      type: "task_delete",
      title: "업무 삭제",
      description: `${targetTask?.task_name || "업무"}을(를) 삭제했습니다.`,
      projectId: project?.id,
      targetType: "task",
      targetId: taskId,
      metadata: {
        deletedTaskName: targetTask?.task_name ?? null,
        deletedTaskType: targetTask?.task_type ?? null,
        deletedTaskStatus: targetTask?.status ?? null,
      },
    });

    setIsUpdating(false);
  }

  function emptySectionValue(source: ProjectSection | null): ProjectSectionDialogValue {
    return {
      process_type: source?.process_type ?? "",
      assembly_vendor: source?.assembly_vendor ?? project?.assembly_vendor ?? null,
      task_manager: source?.task_manager ?? project?.task_manager ?? null,
      quantity: source?.quantity ?? null,
      start_date: null,
      end_date: null,
      memo: source?.memo ?? null,
    };
  }

  async function saveSection(value: ProjectSectionDialogValue) {
    if (!project || !sectionDialog || isSavingSection) return;
    setIsSavingSection(true);
    const normalize = (value: string | null) => value?.trim() || null;

    if (sectionDialog.mode === "add") {
      const result = await createProjectSectionWithTasks({
        projectId: project.id,
        processType: value.process_type,
        assemblyVendor: normalize(value.assembly_vendor),
        taskManager: normalize(value.task_manager),
        quantity: value.quantity,
        startDate: value.start_date || null,
        endDate: value.end_date || null,
        memo: normalize(value.memo),
        sourceSectionId: sectionDialog.source?.id,
      });
      if (result.error || !result.data) {
        console.error("section create error:", result.error);
        alert(result.error?.code === "23505" ? "이미 존재하는 공정입니다." : "공정을 생성하지 못했습니다. 권한과 입력값을 확인하세요.");
        setIsSavingSection(false);
        return;
      }
      await addActivity({
        type: "project_update",
        title: sectionDialog.source ? "기존 공정 기준 공정 추가" : "공정 생성",
        description: `${value.process_type} 공정과 템플릿 업무 ${result.data.task_count}건을 생성했습니다.`,
        projectId: project.id,
        targetType: "project_section",
        targetId: result.data.section_id,
        metadata: { sectionId: result.data.section_id, processType: value.process_type, sourceSectionId: sectionDialog.source?.id ?? null },
      });
      setOpenSectionIds((current) => new Set(current).add(result.data!.section_id));
    } else if (sectionDialog.target) {
      const target = sectionDialog.target;
      const { error } = await supabase.from("project_sections").update({
        assembly_vendor: normalize(value.assembly_vendor), task_manager: normalize(value.task_manager),
        quantity: value.quantity, start_date: value.start_date || null, end_date: value.end_date || null,
        memo: normalize(value.memo), updated_at: new Date().toISOString(),
      }).eq("id", target.id).eq("project_id", project.id);
      if (error) {
        console.error("section update error:", error);
        alert("공정을 수정하지 못했습니다. 권한을 확인하세요.");
        setIsSavingSection(false);
        return;
      }
      await addActivity({ type: "project_update", title: "공정 수정", description: `${target.process_type} 공정 정보를 수정했습니다.`, projectId: project.id, targetType: "project_section", targetId: target.id, metadata: { sectionId: target.id, processType: target.process_type } });
    }
    setSectionDialog(null);
    setIsSavingSection(false);
    await loadProject();
  }

  async function prepareDeleteSection(section: ProjectSection) {
    if (sections.length <= 1) {
      alert("프로젝트에는 최소 1개의 공정이 필요합니다.");
      return;
    }

    const { count, error } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", section.project_id)
      .eq("project_section_id", section.id);

    if (error) {
      console.error("section task count error:", error);
      alert("공정의 업무 개수를 확인하지 못했습니다.");
      return;
    }

    const sectionTasks = tasks.filter((task) => task.project_section_id === section.id);
    setSectionPendingDelete({
      section,
      taskCount: count ?? 0,
      completedCount: sectionTasks.filter((task) => isTaskCompleted(task.status)).length,
    });
  }

  async function confirmDeleteSection() {
    if (!sectionPendingDelete || isDeletingSection) return;
    setIsDeletingSection(true);

    try {
      const result = await deleteProjectSectionWithTasks(sectionPendingDelete.section.id);
      if (result.error || !result.data) {
        console.error("section delete RPC error:", result.error);
        alert(result.error?.message === "프로젝트에는 최소 1개의 공정이 필요합니다."
          ? result.error.message
          : "공정을 삭제하지 못했습니다. 권한과 연결 상태를 확인하세요.");
        return;
      }

      setSectionPendingDelete(null);
      await loadProject();
      toast.success(result.data.deleted_task_count > 0
        ? "공정과 업무가 삭제되었습니다."
        : "공정이 삭제되었습니다.");
    } catch (error) {
      console.error("section delete unexpected error:", error);
      alert("공정을 삭제하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setIsDeletingSection(false);
    }
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

      <nav
        aria-label="프로젝트 상세 메뉴"
        className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        {[
          ["#project-info", "Overview"],
          ["#project-tasks", "Tasks"],
          ["#project-files", "Files"],
          ["#project-activity", "Activity"],
          ["#project-history", "History"],
          ["#project-timeline", "Timeline"],
        ].map(([href, label]) => (
          <a
            key={label}
            href={href}
            className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
          >
            {label}
          </a>
        ))}
      </nav>

      <div
        id="project-info"
        className="mb-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
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
                <EditableCombobox className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white" placeholder="조립업체 검색 또는 직접 입력" options={assemblyVendorOptions} value={projectForm.assembly_vendor} onChange={(value) => setProjectForm({ ...projectForm, assembly_vendor: value })} />
                <select
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  value={projectForm.process_type}
                  onChange={(e) =>
                    setProjectForm({ ...projectForm, process_type: e.target.value })
                  }
                >
                  {processTypes.filter((process) => process.is_active || process.code === projectForm.process_type).map((process) => (
                    <option key={process.id} value={process.code}>
                      {process.name}
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
                <EditableCombobox className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white" placeholder="영업자 검색 또는 직접 입력" options={salespersonOptions} value={projectForm.salesperson} onChange={(value) => setProjectForm({ ...projectForm, salesperson: value })} />
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

      <div
        id="project-tasks"
        className="mb-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              공정 및 업무
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              공정별 담당자, 일정, 진행률과 업무를 관리합니다.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setSectionDialog({ mode: "add", source: null, target: null })}
            className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            공정 추가
          </Button>
        </div>

        <div className="space-y-4">
        {[...sections].sort((a, b) => {
          const aType = processTypes.find((item) => item.code === a.process_type);
          const bType = processTypes.find((item) => item.code === b.process_type);
          return (aType?.sort_order ?? a.sort_order) - (bType?.sort_order ?? b.sort_order)
            || (aType?.name ?? a.process_type).localeCompare(bType?.name ?? b.process_type, "ko-KR")
            || a.created_at.localeCompare(b.created_at);
        }).map((section) => {
          const sectionTasks = tasks.filter((task) => task.project_section_id === section.id);
          const sectionProgress = calculateSectionProgress(sectionTasks);
          const computedStatus = getComputedSectionStatus(sectionTasks);
          const processType = processTypes.find((item) => item.code === section.process_type);
          const isOpen = openSectionIds.has(section.id);
          return (
          <section key={section.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 bg-slate-50 p-4 xl:flex-row xl:items-center xl:justify-between">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenSectionIds((current) => { const next = new Set(current); if (next.has(section.id)) next.delete(section.id); else next.add(section.id); return next; })}>
                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: processType?.color ?? "#64748b" }} />
                <span className="font-bold text-slate-950">{processType?.name ?? section.process_type}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">업무 {sectionProgress.total}건</span>
                <Badge variant={computedStatus === "completed" ? "success" : computedStatus === "in_progress" ? "info" : "default"}>{getProjectStatusLabel(computedStatus)}</Badge>
              </button>
              <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                <span>조립처 <b>{section.assembly_vendor || "-"}</b></span><span>담당자 <b>{section.task_manager || "-"}</b></span>
                <span>수량 <b>{section.quantity ?? "-"}</b></span><span>기간 <b>{section.start_date || "-"} ~ {section.end_date || "-"}</b></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32"><div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>{sectionProgress.completed}/{sectionProgress.total}</span><b>{sectionProgress.percentage}%</b></div><ProgressBar percent={sectionProgress.percentage} className="h-1.5" /></div>
                <Button size="sm" variant="secondary" onClick={() => setSectionDialog({ mode: "edit", source: null, target: section })}>수정</Button>
                <Button size="sm" variant="secondary" onClick={() => setSectionDialog({ mode: "add", source: section, target: null })}>공정 추가</Button>
                <Button size="sm" variant="danger" onClick={() => void prepareDeleteSection(section)}>삭제</Button>
              </div>
            </div>
            {isOpen && <div className="border-t border-slate-200 p-3">
              <div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>대기 {sectionProgress.pending} · 진행 {sectionProgress.inProgress} · 완료 {sectionProgress.completed} · 지연 {sectionProgress.delayed}</span><Button size="sm" variant="primary" onClick={() => { setSelectedTaskSectionId(section.id); setShowTaskModal(true); setOpenSectionIds((current) => new Set(current).add(section.id)); }}><Plus size={14} /> 업무 추가</Button></div>
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
              {sectionTasks.map((task, index) => {
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

              {sectionTasks.length === 0 && (
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
            </div>}
          </section>
          );
        })}
        {tasks.some((task) => task.project_section_id == null) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <b>공정 미지정 레거시 업무 {tasks.filter((task) => task.project_section_id == null).length}건</b>
            <p className="mt-1 text-xs">데이터 보호를 위해 자동 배정하지 않았습니다: {tasks.filter((task) => task.project_section_id == null).map((task) => task.task_name || `업무 #${task.id}`).join(", ")}</p>
          </div>
        )}
        {sections.length === 0 && <EmptyState message="등록된 공정이 없습니다." />}
        </div>
      </div>

      <ProjectFiles projectId={projectId} />

      <section
        id="project-activity"
        className="mb-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            최근 활동
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            이 프로젝트의 최신 활동 10건입니다.
          </p>
        </div>
        <ActivityTimeline limit={10} projectId={Number(projectId)} />
      </section>

      <section
        id="project-history"
        className="mb-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            변경 이력
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            실제 값이 변경된 프로젝트, 업무 및 출고 이력입니다.
          </p>
        </div>
        <ActivityTimeline
          limit={30}
          projectId={Number(projectId)}
          historyOnly
        />
      </section>

      <section
        id="project-timeline"
        className="mb-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            Project Timeline
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            프로젝트 생성부터 완료까지의 핵심 이벤트를 시간순으로 확인합니다.
          </p>
        </div>
        <ProjectTimeline projectId={Number(projectId)} />
      </section>

      <ConfirmDialog
        open={sectionPendingDelete !== null}
        title="⚠️ 공정 삭제"
        description={sectionPendingDelete ? (
          sectionPendingDelete.taskCount > 0
            ? `'${processTypes.find((item) => item.code === sectionPendingDelete.section.process_type)?.name ?? sectionPendingDelete.section.process_type}' 공정에는 업무 ${sectionPendingDelete.taskCount}개가 포함되어 있습니다.\n\n삭제하면 다음 정보가 함께 삭제됩니다.\n• 업무 ${sectionPendingDelete.taskCount}개\n• 일정\n• 담당자\n• 진행상태\n\n완료 업무 ${sectionPendingDelete.completedCount}건이 포함되어 있으며, 이 작업은 되돌릴 수 없습니다.`
            : `'${processTypes.find((item) => item.code === sectionPendingDelete.section.process_type)?.name ?? sectionPendingDelete.section.process_type}' 공정을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`
        ) : ""}
        confirmLabel={sectionPendingDelete?.taskCount ? "공정 및 업무 모두 삭제" : "공정 삭제"}
        danger
        isPending={isDeletingSection}
        onClose={() => { if (!isDeletingSection) setSectionPendingDelete(null); }}
        onConfirm={() => void confirmDeleteSection()}
      />

      {sectionDialog && (
        <ProjectSectionDialog
          open
          mode={sectionDialog.mode}
          processTypes={processTypes.filter((item) => item.is_active && !sections.some((section) => section.process_type === item.code))}
          employees={employees}
          saving={isSavingSection}
          initialValue={sectionDialog.mode === "edit" && sectionDialog.target ? {
            process_type: sectionDialog.target.process_type,
            assembly_vendor: sectionDialog.target.assembly_vendor,
            task_manager: sectionDialog.target.task_manager,
            quantity: sectionDialog.target.quantity,
            start_date: sectionDialog.target.start_date,
            end_date: sectionDialog.target.end_date,
            memo: sectionDialog.target.memo,
          } : { ...emptySectionValue(sectionDialog.source), process_type: "" }}
          onClose={() => setSectionDialog(null)}
          onSubmit={(value) => void saveSection(value)}
        />
      )}

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-5">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">
                업무 추가
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {sections.find((section) => section.id === selectedTaskSectionId)?.process_type || "선택 공정"}에 업무명, 유형, 담당자와 일정을 입력합니다.
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
                onClick={() => { setShowTaskModal(false); setSelectedTaskSectionId(null); }}
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
