"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, Copy, GripVertical, NotebookPen, Plus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addActivity } from "@/lib/activity";
import {
  createAuditChanges,
  PROJECT_AUDIT_FIELDS,
  TASK_AUDIT_FIELDS,
} from "@/lib/audit";
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
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { DatePicker } from "@/components/common/DatePicker";
import { ProjectFiles } from "@/components/files/ProjectFiles";
import ActivityTimeline from "@/components/activity/ActivityTimeline";
import ProjectTimeline from "@/components/activity/ProjectTimeline";
import { ProjectSectionDialog, type ProjectSectionDialogValue } from "@/components/projects/ProjectSectionDialog";
import { getAllProcessTypes, normalizeProcessTypeCode } from "@/lib/process-types";
import {
  calculateSectionProgress,
  createProjectSectionWithTasks,
  deleteProjectSectionWithTasks,
  getComputedSectionStatus,
  getProjectSections,
} from "@/lib/project-sections";
import { toast } from "@/lib/toast";
import { getProjectEntryOptions } from "@/lib/project-master-data";
import { AssemblyVendorMultiSelect } from "@/components/projects/AssemblyVendorMultiSelect";
import { TaskNotesDrawer, type TaskNote, type TaskNoteSummary } from "@/components/projects/TaskNotesDrawer";
import { getCurrentEmployee } from "@/lib/auth";
import { getProjectAssemblyVendors, updateProjectAssemblyVendorQuantity, updateProjectWithVendors } from "@/lib/project-assembly-vendors";
import { formatProjectQuantity, parseProjectQuantity } from "@/lib/project-quantity";
import { PROJECT_SELECT_FIELDS } from "@/lib/projects";
import { getShipmentQuantitySummary, isShipmentQuantityTask, resolveShipmentQuantity } from "@/lib/shipment-quantity";
import { assignTaskOrdersByCurrentSequence, persistRecalculatedTaskOrders, sortTasksBySchedule } from "@/lib/task-ordering";
import type { ProcessType } from "@/types/process-type";
import type { ProjectAssemblyVendor, ProjectSection } from "@/types/project-section";
import { dispatchPersonalNotesChanged } from "@/lib/personal-notes";
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
  assembly_vendor_organization_id: number | null;
  assembly_vendor: string | null;
  process_type: string;
  salesperson: string | null;
  site_address: string | null;
  task_manager: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  completion_due_date: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  memo: string | null;
};

type Task = {
  id: number;
  project_id: number;
  project_section_id?: number | null;
  project_assembly_vendor_id: number | null;
  task_order: number | null;
  task_type: string | null;
  task_name: string | null;
  quantity: number | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  created_at: string | null;
  project_assembly_vendor?: {
    id: number;
    allocated_quantity: number | null;
    organization: { name: string } | null;
  } | null;
};

type Employee = {
  id: number;
  name: string;
  active: boolean | null;
};

const statusList = ["pending", "in_progress", "completed"];
const taskNotePreviewTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default function ProjectDetail() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [assemblyVendors, setAssemblyVendors] = useState<ProjectAssemblyVendor[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<ProjectSection[]>([]);
  const [processTypes, setProcessTypes] = useState<ProcessType[]>([]);
  const [openSectionIds, setOpenSectionIds] = useState<Set<number>>(new Set());
  const [openVendorIds, setOpenVendorIds] = useState<Set<number>>(new Set());
  const [selectedTaskSectionId, setSelectedTaskSectionId] = useState<number | null>(null);
  const [selectedTaskVendorId, setSelectedTaskVendorId] = useState<number | null>(null);
  const [sectionDialog, setSectionDialog] = useState<{
    mode: "add" | "edit";
    source: ProjectSection | null;
    target: ProjectSection | null;
    vendor: ProjectAssemblyVendor | null;
  } | null>(null);
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [sectionPendingDelete, setSectionPendingDelete] = useState<{
    section: ProjectSection;
    taskCount: number;
    completedCount: number;
  } | null>(null);
  const [isDeletingSection, setIsDeletingSection] = useState(false);
  const [salespersonOptions, setSalespersonOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [assemblyVendorOptions, setAssemblyVendorOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [taskQuantityDrafts, setTaskQuantityDrafts] = useState<Record<number, string>>({});
  const [taskNoteSummaries, setTaskNoteSummaries] = useState<Map<number, TaskNoteSummary>>(new Map());
  const [noteTask, setNoteTask] = useState<Task | null>(null);
  const [isRecentActivityOpen, setIsRecentActivityOpen] = useState(false);
  const [isChangeHistoryOpen, setIsChangeHistoryOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [recentActivityCount, setRecentActivityCount] = useState(0);
  const [changeHistoryCount, setChangeHistoryCount] = useState(0);
  const [favoriteUserScope, setFavoriteUserScope] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  const [projectForm, setProjectForm] = useState({
    project_code: "",
    project_name: "",
    client_name: "",
    assemblyVendorIds: [] as number[],
    process_type: "",
    salesperson: "",
    site_address: "",
    task_manager: "",
    start_date: "",
    end_date: "",
    quantity: "",
    quantity_unit: "",
  });

  const [taskForm, setTaskForm] = useState({
    task_name: "",
    task_type: "",
    assignee: "",
    start_date: "",
    due_date: "",
    status: "pending",
    note: "",
    quantity: "",
  });

  const shipmentQuantitySummary = useMemo(() => getShipmentQuantitySummary({
    projectQuantity: project?.quantity ?? null,
    tasks,
  }), [project?.quantity, tasks]);

  const newTaskInputQuantity = taskForm.quantity.trim() === "" ? null : Number(taskForm.quantity);
  const newTaskShipmentSummary = useMemo(() => getShipmentQuantitySummary({
    projectQuantity: project?.quantity ?? null,
    tasks,
    inputQuantity: Number.isFinite(newTaskInputQuantity) ? newTaskInputQuantity : null,
  }), [newTaskInputQuantity, project?.quantity, tasks]);


  const loadProject = useCallback(async function loadProject() {
    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select(PROJECT_SELECT_FIELDS)
      .eq("id", projectId)
      .single();

    if (projectError) {
      alert(projectError.message);
      return;
    }

    const vendorResult = await getProjectAssemblyVendors(Number(projectId));
    if (vendorResult.error) {
      alert(vendorResult.error.message);
      return;
    }
    setProject({
      ...projectData,
      process_type: normalizeProcessTypeCode(projectData.process_type || ""),
    });
    setAssemblyVendors(vendorResult.data);

    setProjectForm({
      project_code: projectData.project_code || "",
      project_name: projectData.project_name || "",
      client_name: projectData.client_name || "",
      assemblyVendorIds: vendorResult.data.map((vendor) => vendor.organizationId),
      process_type: normalizeProcessTypeCode(projectData.process_type || ""),
      salesperson: projectData.salesperson || "",
      site_address: projectData.site_address || "",
      task_manager: projectData.task_manager || "",
      start_date: projectData.start_date || "",
      end_date: projectData.end_date || projectData.completion_due_date || "",
      quantity: projectData.quantity === null ? "" : String(projectData.quantity),
      quantity_unit: projectData.quantity_unit || "",
    });

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*, project_assembly_vendor:project_assembly_vendors(id, allocated_quantity, organization:organizations(name))")
      .eq("project_id", projectId)
      .order("task_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (taskError) {
      alert(taskError.message);
      return;
    }

    const loadedTasks = (taskData || []) as unknown as Task[];
    setTasks(loadedTasks);
    setOpenVendorIds(new Set(vendorResult.data.map((vendor) => vendor.id)));
    setTaskNoteSummaries(new Map());

    if (loadedTasks.length > 0) {
      const { data: noteData, error: noteError } = await supabase
        .from("task_notes")
        .select("id, task_id, note, created_at, created_by, created_by_name")
        .in("task_id", loadedTasks.map((task) => task.id))
        .order("created_at", { ascending: false });

      if (noteError) {
        console.error("task note count load error:", noteError.message);
      } else {
        const summaries = new Map<number, TaskNoteSummary>();
        (noteData ?? []).forEach((note) => {
          const taskId = Number(note.task_id);
          const current = summaries.get(taskId);
          summaries.set(taskId, {
            count: (current?.count ?? 0) + 1,
            latestNote: current?.latestNote ?? {
              id: String(note.id),
              note: String(note.note),
              createdAt: String(note.created_at),
              createdByName: note.created_by_name ? String(note.created_by_name) : null,
            },
          });
        });
        setTaskNoteSummaries(summaries);
      }
    } else {
      setTaskNoteSummaries(new Map());
    }

    const [sectionResult, processTypeResult, entryOptionResult] = await Promise.all([
      getProjectSections(Number(projectId)),
      getAllProcessTypes(),
      getProjectEntryOptions(),
    ]);
    if (sectionResult.error || processTypeResult.error) {
      alert(sectionResult.error?.message || processTypeResult.error?.message || "공정 정보를 불러오지 못했습니다.");
      return;
    }
    const normalizedSections = sectionResult.data.map((section) => ({
      ...section,
      process_type: normalizeProcessTypeCode(section.process_type),
    }));
    const sortedSections = normalizedSections.sort((a, b) => {
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

    setEmployees(entryOptionResult.data.taskManagers.map((employee) => ({
      id: employee.id,
      name: employee.value,
      active: true,
    })));
  }, [projectId]);

  const handleTaskNoteSummaryChange = useCallback((taskId: number, summary: TaskNoteSummary) => {
    setTaskNoteSummaries((current) => {
      const next = new Map(current);
      if (summary.count > 0) next.set(taskId, summary);
      else next.delete(taskId);
      return next;
    });
  }, []);

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
    return isShipmentQuantityTask(task);
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
        quantity: resolveShipmentQuantity(task.quantity, project.quantity),
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
    const quantity = parseProjectQuantity(projectForm.quantity);
    if (projectForm.quantity.trim() && quantity === null) {
      alert("프로젝트 수량을 숫자로 입력하세요.");
      return;
    }
    if (quantity !== null && quantity < 0) {
      alert("프로젝트 수량은 0 이상이어야 합니다.");
      return;
    }

    setIsUpdating(true);

    const nextProjectData = {
      project_code: projectForm.project_code.trim(),
      project_name: projectForm.project_name.trim(),
      client_name: projectForm.client_name.trim() || null,
      process_type: normalizeProcessTypeCode(projectForm.process_type),
      salesperson: projectForm.salesperson.trim() || null,
      site_address: projectForm.site_address.trim() || null,
      task_manager: projectForm.task_manager || null,
      start_date: projectForm.start_date || null,
      end_date: projectForm.end_date || null,
      quantity,
      quantity_unit: projectForm.quantity_unit.trim() || null,
    };
    const changes = createAuditChanges(
      project as unknown as Record<string, unknown>,
      nextProjectData,
      PROJECT_AUDIT_FIELDS
    );

    const vendorsChanged = JSON.stringify(projectForm.assemblyVendorIds) !== JSON.stringify(assemblyVendors.map((vendor) => vendor.organizationId));
    const addedVendorIds = projectForm.assemblyVendorIds.filter((id) => !assemblyVendors.some((vendor) => vendor.organizationId === id));
    const removedVendors = assemblyVendors.filter((vendor) => !projectForm.assemblyVendorIds.includes(vendor.organizationId));
    if (changes.length === 0 && !vendorsChanged) {
      setIsEditingProject(false);
      setIsUpdating(false);
      return;
    }

    const { error } = await updateProjectWithVendors(project.id, nextProjectData, projectForm.assemblyVendorIds);

    if (error) {
      alert(error.message);
      setIsUpdating(false);
      return;
    }

    await loadProject();
    for (const organizationId of addedVendorIds) {
      const organizationName = assemblyVendorOptions.find((vendor) => vendor.id === organizationId)?.name || `업체 #${organizationId}`;
      await addActivity({ type: "project_update", title: "업체 추가", description: `${organizationName} 업체를 추가했습니다.`, projectId: project.id, targetType: "project_assembly_vendor", metadata: { organizationId } });
    }
    for (const vendor of removedVendors) {
      await addActivity({ type: "project_update", title: "업체 삭제", description: `${vendor.organizationName} 업체를 삭제했습니다.`, projectId: project.id, targetType: "project_assembly_vendor", targetId: vendor.id, metadata: { organizationId: vendor.organizationId } });
    }
    await addActivity({
      type: "project_update",
      title: `프로젝트 수정 · ${changes.length + (vendorsChanged ? 1 : 0)}개 항목 변경`,
      description: changes.some((change) => change.field === "quantity" || change.field === "quantity_unit")
        ? `프로젝트 수량 변경: ${formatProjectQuantity(project.quantity, project.quantity_unit)} → ${formatProjectQuantity(quantity, nextProjectData.quantity_unit)}`
        : `${nextProjectData.project_name} 프로젝트 정보를 수정했습니다.`,
      projectId: project.id,
      targetType: "project",
      targetId: project.id,
      metadata: { changes, assemblyVendorIds: projectForm.assemblyVendorIds },
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
      assemblyVendorIds: assemblyVendors.map((vendor) => vendor.organizationId),
      process_type: normalizeProcessTypeCode(project.process_type || ""),
      salesperson: project.salesperson || "",
      site_address: project.site_address || "",
      task_manager: project.task_manager || "",
      start_date: project.start_date || "",
      end_date: project.end_date || project.completion_due_date || "",
      quantity: project.quantity === null ? "" : String(project.quantity),
      quantity_unit: project.quantity_unit || "",
    });

    setIsEditingProject(false);
  }

  async function editVendorAllocatedQuantity(vendor: ProjectAssemblyVendor) {
    if (!project || isUpdating) return;
    const input = window.prompt(
      `${vendor.organizationName} 배정 수량을 입력하세요.`,
      vendor.allocatedQuantity === null ? "" : String(vendor.allocatedQuantity)
    );
    if (input === null) return;
    const parsed = parseProjectQuantity(input);
    if (input.trim() && parsed === null) return toast.warning("업체 수량을 숫자로 입력하세요.");
    if (parsed !== null && parsed < 0) return toast.warning("업체 수량은 0 이상이어야 합니다.");

    setIsUpdating(true);
    const result = await updateProjectAssemblyVendorQuantity(vendor.id, parsed);
    if (result.error) {
      toast.error(result.error.message);
      setIsUpdating(false);
      return;
    }
    setAssemblyVendors((current) => current.map((item) =>
      item.id === vendor.id ? { ...item, allocatedQuantity: parsed } : item
    ));
    await addActivity({
      type: "project_update",
      title: "업체 수량 변경",
      description: `${vendor.organizationName} 배정 수량을 ${formatProjectQuantity(parsed, project.quantity_unit)}(으)로 변경했습니다.`,
      projectId: project.id,
      targetType: "project_assembly_vendor",
      targetId: vendor.id,
      metadata: { previousQuantity: vendor.allocatedQuantity, nextQuantity: parsed },
    });
    setIsUpdating(false);
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
    const result = await persistRecalculatedTaskOrders(nextTasks);
    if (result.error) {
      alert(result.error.message);
      return null;
    }
    return result.data;
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

    if (
      tasks[dragIndex].project_assembly_vendor_id !== tasks[targetIndex].project_assembly_vendor_id ||
      tasks[dragIndex].project_section_id !== tasks[targetIndex].project_section_id
    ) {
      toast.warning("다른 조립업체 또는 공정으로는 순서를 이동할 수 없습니다.");
      setDraggingTaskId(null);
      return;
    }

    setIsUpdating(true);

    const nextTasks = [...tasks];
    const [draggedTask] = nextTasks.splice(dragIndex, 1);
    nextTasks.splice(targetIndex, 0, draggedTask);

    const savedTasks = await saveTaskOrders(assignTaskOrdersByCurrentSequence(nextTasks));

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
          project_assembly_vendor_id: task.project_assembly_vendor_id,
          task_order: currentIndex + 2,
          task_name: `${task.task_name || "업무"}(복사본)`,
          task_type: task.task_type,
          quantity: task.quantity,
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
      title: "업체 Task 생성",
      description: `${assemblyVendors.find((vendor) => vendor.id === task.project_assembly_vendor_id)?.organizationName || "조립업체"} · ${data.task_name || "업무"}을(를) 생성했습니다.`,
      projectId: project.id,
      targetType: "task",
      targetId: data.id,
    });

    setIsUpdating(false);
  }

  async function addTask() {
    if (!project || !selectedTaskSectionId || !selectedTaskVendorId || isSavingTask) return;

    if (!taskForm.task_name.trim()) {
      alert("업무명을 입력하세요.");
      return;
    }

    if (!taskForm.task_type.trim()) {
      alert("업무유형을 입력하세요.");
      return;
    }

    const isShipment = taskForm.task_type.includes("출고");
    const normalizedQuantity = taskForm.quantity.trim();
    const taskQuantity = normalizedQuantity === "" ? null : Number(normalizedQuantity);
    if (isShipment && taskQuantity !== null && (!Number.isInteger(taskQuantity) || taskQuantity <= 0)) {
      toast.warning("출고 수량은 0보다 큰 정수로 입력하세요.");
      return;
    }
    if (isShipment && taskQuantity !== null && newTaskShipmentSummary.projectQuantity === null) {
      toast.warning("프로젝트 전체 수량을 먼저 확인해주세요.");
      return;
    }
    if (isShipment && taskQuantity !== null && newTaskShipmentSummary.isExceeded) {
      toast.error(
        `프로젝트 수량을 초과했습니다. 기존 출고 예정 ${formatProjectQuantity(newTaskShipmentSummary.existingShipmentTotal, project.quantity_unit)}, 현재 입력 ${formatProjectQuantity(taskQuantity, project.quantity_unit)}, 초과 ${formatProjectQuantity(newTaskShipmentSummary.exceededQuantity, project.quantity_unit)}, 최대 입력 가능 ${formatProjectQuantity(newTaskShipmentSummary.maxInputQuantity, project.quantity_unit)}`
      );
      return;
    }

    setIsSavingTask(true);

    const sectionTasks = tasks.filter((task) =>
      task.project_section_id === selectedTaskSectionId
      && task.project_assembly_vendor_id === selectedTaskVendorId
    );
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
          project_assembly_vendor_id: selectedTaskVendorId,
          task_order: maxOrder + 1,
          task_name: taskForm.task_name.trim(),
          task_type: taskForm.task_type.trim(),
          quantity: isShipment ? taskQuantity : null,
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

    const orderResult = await persistRecalculatedTaskOrders([...tasks, data as Task]);
    if (orderResult.error) {
      alert(orderResult.error.message);
      setIsSavingTask(false);
      return;
    }
    const nextTasks = orderResult.data;

    const normalizedNote = taskForm.note.trim();
    if (normalizedNote) {
      const employee = await getCurrentEmployee();
      const { data: noteData, error: noteError } = await supabase
        .from("task_notes")
        .insert({
          task_id: data.id,
          note: normalizedNote,
          created_by_name: employee?.name ?? null,
        })
        .select("id, task_id, note, created_at, created_by, updated_at, created_by_name")
        .single();

      if (noteError) {
        toast.error(`업무는 생성되었지만 메모를 저장하지 못했습니다. ${noteError.message}`);
      } else {
        const createdNote = noteData as TaskNote;
        handleTaskNoteSummaryChange(data.id, {
          count: 1,
          latestNote: {
            id: createdNote.id,
            note: createdNote.note,
            createdAt: createdNote.created_at,
            createdByName: createdNote.created_by_name,
          },
        });
        void addActivity({
          type: "task_note_create",
          title: "업무 메모 등록",
          description: `${data.task_name || "업무"} 업무에 메모를 등록했습니다.`,
          projectId: project.id,
          targetType: "task",
          targetId: data.id,
          metadata: { taskNoteId: createdNote.id },
        });
      }
    }

    await updateProjectStatus(nextTasks);

    setTasks(nextTasks);
    recordTaskChange(data as Task);
    await addActivity({
      type: "task_create",
      title: "업체 Task 생성",
      description: `${assemblyVendors.find((vendor) => vendor.id === selectedTaskVendorId)?.organizationName || "조립업체"} · ${data.task_name || "업무"}을(를) 생성했습니다.`,
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
      note: "",
      quantity: "",
    });
    setShowTaskModal(false);
    setOpenSectionIds((current) => new Set(current).add(selectedTaskSectionId));
    setSelectedTaskVendorId(null);
    setSelectedTaskSectionId(null);
    setIsSavingTask(false);
  }

  async function updateTaskQuantity(task: Task, rawQuantity: string) {
    if (isUpdating || !isShipmentTask(task)) return;

    const normalizedQuantity = rawQuantity.trim();
    const quantity = normalizedQuantity === "" ? null : Number(normalizedQuantity);
    if (quantity !== null && (!Number.isInteger(quantity) || quantity <= 0)) {
      toast.warning("출고 수량은 0보다 큰 정수로 입력하세요.");
      return;
    }
    const summary = getShipmentQuantitySummary({
      projectQuantity: project?.quantity ?? null,
      tasks,
      editingTaskId: task.id,
      inputQuantity: quantity,
    });
    if (quantity !== null && summary.projectQuantity === null) {
      toast.warning("프로젝트 전체 수량을 먼저 확인해주세요.");
      return;
    }
    if (quantity !== null && summary.isExceeded) {
      toast.error(
        `프로젝트 수량을 초과했습니다. 기존 출고 예정 ${formatProjectQuantity(summary.existingShipmentTotal, project?.quantity_unit)}, 현재 입력 ${formatProjectQuantity(quantity, project?.quantity_unit)}, 예상 출고 합계 ${formatProjectQuantity(summary.expectedShipmentTotal, project?.quantity_unit)}, 초과 ${formatProjectQuantity(summary.exceededQuantity, project?.quantity_unit)}, 최대 입력 가능 ${formatProjectQuantity(summary.maxInputQuantity, project?.quantity_unit)}`
      );
      return;
    }
    if (task.quantity === quantity) return;

    setIsUpdating(true);
    const { error } = await supabase
      .from("tasks")
      .update({ quantity })
      .eq("id", task.id);

    if (error) {
      toast.error(error.message);
      setIsUpdating(false);
      return;
    }

    const updatedTask = { ...task, quantity };
    setTasks((current) => current.map((item) => item.id === task.id ? updatedTask : item));
    setTaskQuantityDrafts((current) => {
      const next = { ...current };
      delete next[task.id];
      return next;
    });
    const changes = createAuditChanges(
      task as unknown as Record<string, unknown>,
      updatedTask as unknown as Record<string, unknown>,
      TASK_AUDIT_FIELDS
    );
    recordTaskChange(updatedTask);
    await addActivity({
      type: "task_update",
      title: `업무 수정 · ${changes.length}개 항목 변경`,
      description: `${updatedTask.task_name || "업무"} 출고 수량을 변경했습니다.`,
      projectId: updatedTask.project_id,
      targetType: "task",
      targetId: updatedTask.id,
      metadata: { changes },
    });
    setIsUpdating(false);
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

    if (updatedTask) {
      const orderResult = await persistRecalculatedTaskOrders(
        tasks.map((task) => task.id === taskId ? updatedTask : task)
      );
      if (orderResult.error) alert(orderResult.error.message);
      setTasks(orderResult.data);
    }

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

  async function updateTaskStartDate(taskId: number, newStartDate: string | null) {
    if (isUpdating) return;

    setIsUpdating(true);

    const savedDate = newStartDate;

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

    if (updatedTask) {
      const orderResult = await persistRecalculatedTaskOrders(
        tasks.map((task) => task.id === taskId ? updatedTask : task)
      );
      if (orderResult.error) alert(orderResult.error.message);
      setTasks(orderResult.data);
    }

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

  async function updateTaskDueDate(taskId: number, newDueDate: string | null) {
    if (isUpdating) return;

    setIsUpdating(true);

    const savedDate = newDueDate;

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

    if (updatedTask) {
      const orderResult = await persistRecalculatedTaskOrders(
        tasks.map((task) => task.id === taskId ? updatedTask : task)
      );
      if (orderResult.error) alert(orderResult.error.message);
      setTasks(orderResult.data);
    }

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

  async function updateTaskVendor(taskId: number, projectAssemblyVendorId: number) {
    if (isUpdating) return;
    const targetTask = tasks.find((task) => task.id === taskId);
    const nextVendor = assemblyVendors.find((vendor) => vendor.id === projectAssemblyVendorId);
    if (!targetTask || !nextVendor || targetTask.project_assembly_vendor_id === projectAssemblyVendorId) return;

    setIsUpdating(true);
    const { data, error } = await supabase
      .from("tasks")
      .update({ project_assembly_vendor_id: projectAssemblyVendorId })
      .eq("id", taskId)
      .eq("project_id", targetTask.project_id)
      .select("*, project_assembly_vendor:project_assembly_vendors(id, allocated_quantity, organization:organizations(name))")
      .single();

    if (error) {
      toast.error(error.message);
      setIsUpdating(false);
      return;
    }

    const updatedTask = data as unknown as Task;
    const orderResult = await persistRecalculatedTaskOrders(
      tasks.map((task) => task.id === taskId ? updatedTask : task)
    );
    if (orderResult.error) toast.error(orderResult.error.message);
    setTasks(orderResult.data);
    await addActivity({
      type: "task_update",
      title: "업체 Task 수정",
      description: `${targetTask.task_name || "업무"} 조립업체를 ${nextVendor.organizationName}(으)로 변경했습니다.`,
      projectId: targetTask.project_id,
      targetType: "task",
      targetId: targetTask.id,
      metadata: {
        previousProjectAssemblyVendorId: targetTask.project_assembly_vendor_id,
        nextProjectAssemblyVendorId: projectAssemblyVendorId,
      },
    });
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
    if (!targetTask) {
      toast.error("삭제할 업무를 찾을 수 없습니다.");
      setIsUpdating(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("delete_project_task", { p_task_id: taskId });
      if (error?.code === "PGRST202") {
        throw new Error("업무 삭제 DB migration이 적용되지 않았습니다. delete_project_task RPC를 먼저 배포해 주세요.");
      }
      if (error) throw new Error(error.message);
      const result = data as { deleted_task_id?: number; project_status?: string; unlinked_shipment_count?: number } | null;
      if (Number(result?.deleted_task_id) !== taskId) throw new Error("업무 삭제 결과를 확인할 수 없습니다.");

      const nextTasks = tasks.filter((task) => task.id !== taskId);
      const orderResult = await persistRecalculatedTaskOrders(nextTasks);
      if (orderResult.error) toast.error(orderResult.error.message);
      setTasks(orderResult.data);
      if (project && result?.project_status) setProject({ ...project, status: result.project_status });

      await addActivity({
        type: "task_delete",
        title: "업체 Task 삭제",
        description: `${assemblyVendors.find((vendor) => vendor.id === targetTask.project_assembly_vendor_id)?.organizationName || "조립업체 미지정"} · ${targetTask.task_name || "업무"}을(를) 삭제했습니다.`,
        projectId: project?.id,
        targetType: "task",
        targetId: taskId,
        metadata: {
          deletedTaskName: targetTask.task_name ?? null,
          deletedTaskType: targetTask.task_type ?? null,
          deletedTaskStatus: targetTask.status ?? null,
          unlinkedShipmentCount: result?.unlinked_shipment_count ?? 0,
        },
      });
      toast.success("업무가 삭제되었습니다.");
    } catch (error) {
      console.error("task delete error:", error);
      toast.error(error instanceof Error ? error.message : "업무를 삭제하지 못했습니다.");
    } finally {
      setIsUpdating(false);
    }
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
      targetAssemblyVendorIds: null,
    };
  }

  function vendorSectionValue(section: ProjectSection, vendor: ProjectAssemblyVendor): ProjectSectionDialogValue {
    const scopedTasks = tasks.filter((task) =>
      task.project_section_id === section.id
      && task.project_assembly_vendor_id === vendor.id
    );
    const startDates = scopedTasks.flatMap((task) => task.start_date ? [task.start_date] : []).sort();
    const dueDates = scopedTasks.flatMap((task) => task.due_date ? [task.due_date] : []).sort();

    return {
      process_type: section.process_type,
      assembly_vendor: vendor.organizationName,
      task_manager: scopedTasks.find((task) => task.assignee?.trim())?.assignee ?? null,
      quantity: vendor.allocatedQuantity,
      start_date: startDates[0] ?? null,
      end_date: dueDates[dueDates.length - 1] ?? null,
      memo: section.memo,
      targetAssemblyVendorIds: null,
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
        targetAssemblyVendorIds: value.targetAssemblyVendorIds,
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
    } else if (sectionDialog.target && sectionDialog.vendor) {
      const target = sectionDialog.target;
      const vendor = sectionDialog.vendor;
      const taskUpdate = await supabase.from("tasks").update({
        assignee: normalize(value.task_manager),
        start_date: value.start_date || null,
        due_date: value.end_date || null,
      })
        .eq("project_id", project.id)
        .eq("project_section_id", target.id)
        .eq("project_assembly_vendor_id", vendor.id);
      if (taskUpdate.error) {
        console.error("vendor section task update error:", taskUpdate.error);
        alert("해당 조립업체의 공정 업무를 수정하지 못했습니다. 권한을 확인하세요.");
        setIsSavingSection(false);
        return;
      }
      const nextTasks = tasks.map((task) =>
        task.project_section_id === target.id && task.project_assembly_vendor_id === vendor.id
          ? {
              ...task,
              assignee: normalize(value.task_manager),
              start_date: value.start_date || null,
              due_date: value.end_date || null,
            }
          : task
      );
      const orderResult = await persistRecalculatedTaskOrders(nextTasks);
      if (orderResult.error) {
        alert(orderResult.error.message);
        setIsSavingSection(false);
        return;
      }
      setTasks(orderResult.data);

      const quantityResult = await updateProjectAssemblyVendorQuantity(vendor.id, value.quantity);
      if (quantityResult.error) {
        console.error("vendor quantity update error:", quantityResult.error);
        alert("해당 조립업체의 배정 수량을 수정하지 못했습니다.");
        setIsSavingSection(false);
        return;
      }
      await addActivity({
        type: "task_update",
        title: "업체 공정 수정",
        description: `${vendor.organizationName} · ${target.process_type} 공정의 담당자, 수량, 기간을 수정했습니다.`,
        projectId: project.id,
        targetType: "project_section",
        targetId: target.id,
        metadata: { sectionId: target.id, projectAssemblyVendorId: vendor.id },
      });
    } else if (sectionDialog.target) {
      const target = sectionDialog.target;
      const { error } = await supabase.from("project_sections").update({
        task_manager: normalize(value.task_manager),
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

  async function copyProjectToPersonalNote() {
    if (!project) return;
    const sourceMemo = project.memo?.trim() || "프로젝트 상세 내용을 확인해주세요.";
    const memoTitle = project.memo?.trim().split(/\r?\n/)[0]?.slice(0, 120) || "프로젝트 정보";
    const copiedAt = new Date().toISOString().slice(0, 10);
    const content = `프로젝트 : ${project.project_name}\n\n--------------------\n\n${sourceMemo}\n\n--------------------\n\n복사일\n${copiedAt}`;
    const response = await fetch("/api/personal-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteType: "memo", title: `[${project.project_name}] ${memoTitle}`, content, color: "default", dueDate: null }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) { toast.error(result.error ?? "내 메모에 추가하지 못했습니다."); return; }
    dispatchPersonalNotesChanged();
    toast.success("내 메모에 추가되었습니다.");
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
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 lg:px-5">
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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
              <button
                type="button"
                onClick={() => void copyProjectToPersonalNote()}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                <Copy size={14}/>내 메모로 복사
              </button>
            </div>

            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">
              {project.project_name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {project.process_type} · 발주처 {project.client_name || "-"} · 조립처{" "}
              {assemblyVendors.map((vendor) => vendor.organizationName).join(" · ") || "-"} · 영업자 {project.salesperson || "-"} ·
              담당자 {project.task_manager || "-"} · 수량 {formatProjectQuantity(project.quantity, project.quantity_unit)}
            </p>
          </div>

          <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 xl:w-64">
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
        className="mb-6 flex flex-nowrap items-center gap-0.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
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
            className="shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 lg:px-4"
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
                <span>· 수량 {formatProjectQuantity(project.quantity, project.quantity_unit)}</span>
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
                <AssemblyVendorMultiSelect options={assemblyVendorOptions} value={projectForm.assemblyVendorIds} onChange={(value) => setProjectForm({ ...projectForm, assemblyVendorIds: value })} disabled={isUpdating} />
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
                <select className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white" value={projectForm.salesperson} onChange={(event) => setProjectForm({ ...projectForm, salesperson: event.target.value })}>
                  <option value="">영업자 선택</option>
                  {projectForm.salesperson && !salespersonOptions.some((option) => option.value === projectForm.salesperson) && <option value={projectForm.salesperson}>{projectForm.salesperson} (기존값)</option>}
                  {salespersonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
                <input type="number" min={0} step="any" className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white" value={projectForm.quantity} onChange={(e) => setProjectForm({ ...projectForm, quantity: e.target.value })} placeholder="프로젝트 수량" />
                <input className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white" value={projectForm.quantity_unit} onChange={(e) => setProjectForm({ ...projectForm, quantity_unit: e.target.value })} placeholder="수량 단위 (세대, 개, 짝, SET, 식)" />
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
                  ["조립처", assemblyVendors.map((vendor) => `${vendor.organizationName}${vendor.isPrimary ? " (Primary)" : ""}`).join(" · ") || "-"],
                  ["영업자", project.salesperson || "-"],
                  ["현장주소", project.site_address || "-"],
                  ["업무담당자", project.task_manager || "-"],
                  ["시작일", project.start_date || "-"],
                  ["종료일", projectEndDate || "-"],
                  ["수량", formatProjectQuantity(project.quantity, project.quantity_unit)],
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
              조립업체별 공정 및 업무
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              조립업체별 배정 수량, 진행률과 업무를 관리합니다.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setSectionDialog({ mode: "add", source: null, target: null, vendor: null })}
            className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            공정 추가
          </Button>
        </div>

        <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
          shipmentQuantitySummary.isExceeded
            ? "border-red-200 bg-red-50 text-red-700"
            : shipmentQuantitySummary.remainingQuantity !== null
              && shipmentQuantitySummary.projectQuantity !== null
              && shipmentQuantitySummary.remainingQuantity > 0
              && shipmentQuantitySummary.remainingQuantity <= shipmentQuantitySummary.projectQuantity * 0.1
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
        }`}>
          <div className="font-semibold">
            출고 예정 {formatProjectQuantity(shipmentQuantitySummary.existingShipmentTotal, project.quantity_unit)} / {formatProjectQuantity(project.quantity, project.quantity_unit)}
            {shipmentQuantitySummary.remainingQuantity !== null && !shipmentQuantitySummary.isExceeded
              ? ` · 잔여 ${formatProjectQuantity(Math.max(0, shipmentQuantitySummary.remainingQuantity), project.quantity_unit)}`
              : ""}
            {shipmentQuantitySummary.isExceeded
              ? ` · 초과 ${formatProjectQuantity(shipmentQuantitySummary.exceededQuantity, project.quantity_unit)}`
              : ""}
          </div>
          {shipmentQuantitySummary.projectQuantity !== null
            && shipmentQuantitySummary.remainingQuantity === 0
            && <p className="mt-1 text-xs">전체 수량이 출고 예정으로 배정되었습니다.</p>}
          {shipmentQuantitySummary.hasBlankShipmentTask && shipmentQuantitySummary.hasQuantityShipmentTask && (
            <p className="mt-1 text-xs text-amber-700">
              수량이 비어 있는 출고 업무가 있습니다. 해당 업무는 전체 수량으로 출고될 수 있으니 확인해주세요.
            </p>
          )}
          {shipmentQuantitySummary.projectQuantity === null && (
            <p className="mt-1 text-xs text-amber-700">프로젝트 전체 수량이 없어 출고 예정 수량을 검증할 수 없습니다.</p>
          )}
        </div>

        <div className="space-y-3">
        {assemblyVendors.map((vendor) => {
          const vendorTasks = tasks.filter((task) => task.project_assembly_vendor_id === vendor.id);
          const vendorProgress = calculateSectionProgress(vendorTasks);
          const vendorOpen = openVendorIds.has(vendor.id);
          return (
          <section key={vendor.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2.5 bg-slate-100 p-3 lg:flex-row lg:items-center lg:justify-between">
              <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setOpenVendorIds((current) => { const next = new Set(current); if (next.has(vendor.id)) next.delete(vendor.id); else next.add(vendor.id); return next; })}>
                {vendorOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
                <span className="truncate text-base font-bold text-slate-950">{vendor.organizationName}</span>
                {vendor.isPrimary && <Badge variant="info">Primary</Badge>}
                <span className="whitespace-nowrap text-sm font-semibold text-slate-600">{formatProjectQuantity(vendor.allocatedQuantity, project.quantity_unit)}</span>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">업무 {vendorProgress.completed}/{vendorProgress.total} · {vendorProgress.percentage}%</span>
                <Button size="sm" variant="secondary" disabled={isUpdating} onClick={() => void editVendorAllocatedQuantity(vendor)}>수량 변경</Button>
                <Button size="sm" variant="primary" disabled={sections.length === 0} onClick={() => { setSelectedTaskVendorId(vendor.id); setSelectedTaskSectionId(sections[0]?.id ?? null); setShowTaskModal(true); setOpenVendorIds((current) => new Set(current).add(vendor.id)); }}><Plus size={14} /> Task</Button>
              </div>
            </div>
            {vendorOpen && <div className="space-y-3 border-t border-slate-200 p-3">
        {[...sections].sort((a, b) => {
          const aType = processTypes.find((item) => item.code === a.process_type);
          const bType = processTypes.find((item) => item.code === b.process_type);
          return (aType?.sort_order ?? a.sort_order) - (bType?.sort_order ?? b.sort_order)
            || (aType?.name ?? a.process_type).localeCompare(bType?.name ?? b.process_type, "ko-KR")
            || a.created_at.localeCompare(b.created_at);
        }).map((section) => {
          const sectionTasks = sortTasksBySchedule(tasks.filter((task) =>
            task.project_section_id === section.id
            && task.project_assembly_vendor_id === vendor.id
          ));
          const sectionProgress = calculateSectionProgress(sectionTasks);
          const computedStatus = getComputedSectionStatus(sectionTasks);
          const processType = processTypes.find((item) => item.code === section.process_type);
          const isOpen = openSectionIds.has(section.id);
          const vendorTaskManager = sectionTasks.find((task) => task.assignee?.trim())?.assignee ?? "-";
          const vendorStartDates = sectionTasks.flatMap((task) => task.start_date ? [task.start_date] : []).sort();
          const vendorDueDates = sectionTasks.flatMap((task) => task.due_date ? [task.due_date] : []).sort();
          const vendorStartDate = vendorStartDates[0] ?? "-";
          const vendorDueDate = vendorDueDates[vendorDueDates.length - 1] ?? "-";
          return (
          <section key={section.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-2.5 bg-slate-50 p-3 xl:flex-row xl:items-center xl:justify-between">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenSectionIds((current) => { const next = new Set(current); if (next.has(section.id)) next.delete(section.id); else next.add(section.id); return next; })}>
                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: processType?.color ?? "#64748b" }} />
                <span className="font-bold text-slate-950">{processType?.name ?? section.process_type}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">업무 {sectionProgress.total}건</span>
                <Badge variant={computedStatus === "completed" ? "success" : computedStatus === "in_progress" ? "info" : "default"}>{getProjectStatusLabel(computedStatus)}</Badge>
              </button>
              <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                <span>조립처 <b>{vendor.organizationName}</b></span><span>담당자 <b>{vendorTaskManager}</b></span>
                <span>수량 <b>{vendor.allocatedQuantity ?? "-"}</b></span><span>기간 <b>{vendorStartDate} ~ {vendorDueDate}</b></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32"><div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>{sectionProgress.completed}/{sectionProgress.total}</span><b>{sectionProgress.percentage}%</b></div><ProgressBar percent={sectionProgress.percentage} className="h-1.5" /></div>
                <Button size="sm" variant="secondary" onClick={() => setSectionDialog({ mode: "edit", source: null, target: section, vendor })}>수정</Button>
                <Button size="sm" variant="secondary" onClick={() => setSectionDialog({ mode: "add", source: section, target: null, vendor })}>공정 추가</Button>
                <Button size="sm" variant="danger" onClick={() => void prepareDeleteSection(section)}>삭제</Button>
              </div>
            </div>
            {isOpen && <div className="border-t border-slate-200 p-3">
              <div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>대기 {sectionProgress.pending} · 진행 {sectionProgress.inProgress} · 완료 {sectionProgress.completed} · 지연 {sectionProgress.delayed}</span><Button size="sm" variant="primary" onClick={() => { setSelectedTaskVendorId(vendor.id); setSelectedTaskSectionId(section.id); setShowTaskModal(true); setOpenSectionIds((current) => new Set(current).add(section.id)); }}><Plus size={14} /> Task</Button></div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[1280px] table-fixed text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50">
              <tr className="border-y border-slate-200 bg-slate-50 text-xs font-semibold leading-none text-slate-500">
                <th className="w-[4%] bg-slate-50 px-2 py-2 text-center">순번</th>
                <th className="w-[18%] bg-slate-50 px-2.5 py-2 text-left">업무명</th>
                <th className="w-[8%] bg-slate-50 px-2 py-2 text-left">업무유형</th>
                <th className="w-[10%] bg-slate-50 px-2 py-2 text-left">조립업체</th>
                <th className="w-[9%] bg-slate-50 px-2 py-2 text-left">담당자</th>
                <th className="w-[14%] bg-slate-50 px-2 py-2 text-left">시작일</th>
                <th className="w-[16%] bg-slate-50 px-2 py-2 text-left">마감일</th>
                <th className="w-[7%] bg-slate-50 px-2 py-2 text-left">상태</th>
                <th className="w-[7%] bg-slate-50 px-2 py-2 text-center">완료일</th>
                <th className="w-[7%] bg-slate-50 px-2 py-2 text-center">관리</th>
              </tr>
            </thead>

            <tbody>
              {sectionTasks.map((task, index) => {
                const dueDateBadge = getDueDateBadge(task);
                const noteSummary = taskNoteSummaries.get(task.id);
                const latestNote = noteSummary?.latestNote ?? null;
                const quantityDraft = taskQuantityDrafts[task.id] ?? task.quantity?.toString() ?? "";
                const parsedQuantityDraft = quantityDraft.trim() === "" ? null : Number(quantityDraft);
                const isQuantityDraftInvalid = parsedQuantityDraft !== null
                  && (!Number.isInteger(parsedQuantityDraft) || parsedQuantityDraft <= 0);
                const taskShipmentSummary = getShipmentQuantitySummary({
                  projectQuantity: project.quantity,
                  tasks,
                  editingTaskId: task.id,
                  inputQuantity: Number.isFinite(parsedQuantityDraft) ? parsedQuantityDraft : null,
                });

                return (
                  <tr
                    key={task.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleTaskDrop(task.id)}
                    className={`border-b border-slate-100 transition-colors ${
                      draggingTaskId === task.id
                          ? "bg-blue-50 opacity-50"
                        : isTaskCompleted(task.status)
                          ? "text-slate-400 hover:bg-slate-50/80"
                          : "hover:bg-blue-50/40"
                    }`}
                  >
                    <td className="h-12 px-2 py-1.5 text-center align-middle text-xs font-medium text-slate-400">
                      {index + 1}
                    </td>
                    <td className="h-14 px-2.5 py-1.5 align-middle">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={`min-w-0 flex-1 truncate font-semibold leading-5 ${
                            isTaskCompleted(task.status)
                              ? "text-slate-400"
                              : "text-slate-950"
                          }`}
                          title={task.task_name || "-"}
                        >
                          {task.task_name || "-"}
                        </div>
                        <button
                          type="button"
                          aria-label={`${task.task_name || "업무"} 메모 열기`}
                          title="업무 메모"
                          onClick={() => setNoteTask(task)}
                          className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold transition-colors hover:bg-blue-50 ${
                            (noteSummary?.count ?? 0) > 0 ? "text-blue-600" : "text-slate-400"
                          }`}
                        >
                          <NotebookPen size={15} />
                          {(noteSummary?.count ?? 0) > 0 && <span>{noteSummary?.count}</span>}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNoteTask(task)}
                        aria-label={`${task.task_name || "업무"} 최근 메모 열기`}
                        title={latestNote?.note || "메모 작성..."}
                        className={`mt-1 block w-full truncate text-left text-xs leading-4 transition-colors hover:text-blue-600 ${latestNote ? "text-slate-500" : "text-slate-400"}`}
                      >
                        {latestNote ? (
                          <>
                            <span>{latestNote.note}</span>
                            <span className="hidden xl:inline"> · {latestNote.createdByName || "작성자 미확인"} · {taskNotePreviewTimeFormatter.format(new Date(latestNote.createdAt))}</span>
                          </>
                        ) : "메모 작성..."}
                      </button>
                    </td>
                    <td className="h-12 px-2 py-1.5 align-middle">
                      <div className="truncate text-sm leading-5 text-slate-600" title={task.task_type || "-"}>
                        {task.task_type || "-"}
                      </div>
                      {isShipmentTask(task) && (
                        <div className="mt-1 flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            max={taskShipmentSummary.maxInputQuantity ?? undefined}
                            inputMode="numeric"
                            value={quantityDraft}
                            disabled={isUpdating}
                            aria-label={`${task.task_name || "업무"} 출고 수량`}
                            placeholder="비워두면 전체 수량"
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                            }}
                            onChange={(event) => setTaskQuantityDrafts((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))}
                            onBlur={(event) => {
                              const rawQuantity = event.currentTarget.value;
                              const parsedQuantity = rawQuantity.trim() === "" ? null : Number(rawQuantity);
                              if (parsedQuantity !== null && (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0)) return;
                              void updateTaskQuantity(task, rawQuantity);
                            }}
                            className={`h-7 min-w-0 w-full rounded-lg border bg-white px-2 text-xs outline-none placeholder:text-[10px] placeholder:text-slate-400 disabled:bg-slate-100 ${
                              isQuantityDraftInvalid || taskShipmentSummary.isExceeded
                                ? "border-red-300 text-red-700 focus:border-red-400"
                                : "border-slate-200 text-slate-700 focus:border-blue-300"
                            }`}
                          />
                          {project.quantity_unit && (
                            <span className="shrink-0 text-[10px] text-slate-400">{project.quantity_unit}</span>
                          )}
                        </div>
                      )}
                      {isShipmentTask(task) && (
                        <p className={`mt-1 text-[10px] ${
                          isQuantityDraftInvalid || taskShipmentSummary.isExceeded ? "text-red-600" : "text-slate-400"
                        }`}>
                          {isQuantityDraftInvalid
                            ? "0보다 큰 정수만 입력"
                            : taskShipmentSummary.isExceeded
                              ? `초과 ${formatProjectQuantity(taskShipmentSummary.exceededQuantity, project.quantity_unit)} · 저장 불가`
                              : `최대 ${formatProjectQuantity(taskShipmentSummary.maxInputQuantity, project.quantity_unit)} · 입력 후 잔여 ${formatProjectQuantity(taskShipmentSummary.remainingQuantity, project.quantity_unit)}`}
                        </p>
                      )}
                    </td>
                    <td className="h-14 px-2 py-2 align-middle">
                      <select
                        value={task.project_assembly_vendor_id ?? ""}
                        disabled={isUpdating}
                        onChange={(event) => void updateTaskVendor(task.id, Number(event.target.value))}
                        className="h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-300 disabled:bg-slate-100"
                      >
                        {assemblyVendors.map((option) => (
                          <option key={option.id} value={option.id}>{option.organizationName}</option>
                        ))}
                      </select>
                    </td>
                    <td className="h-14 px-2 py-2 align-middle">
                      <select
                        value={task.assignee || "미배정"}
                        disabled={isUpdating}
                        onChange={(e) =>
                          updateTaskAssignee(task.id, e.target.value)
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                        className="h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white disabled:bg-slate-100"
                      >
                        <option value="미배정">미지정</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.name}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="h-14 px-2 py-2 align-middle">
                      <DatePicker
                        value={task.start_date}
                        disabled={isUpdating}
                        onSave={(date) => updateTaskStartDate(task.id, date)}
                        placeholder="시작일 선택"
                        className="w-full"
                      />
                    </td>
                    <td className="h-14 px-2 py-2 align-middle">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <DatePicker
                          value={task.due_date}
                          disabled={isUpdating}
                          onSave={(date) => updateTaskDueDate(task.id, date)}
                          placeholder="마감일 선택"
                          className="min-w-0 flex-1"
                        />
                        {dueDateBadge && (
                          <Badge
                            variant={dueDateBadge.variant}
                            className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold"
                          >
                            {dueDateBadge.label}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="h-14 px-2 py-2 align-middle">
                      <select
                        value={normalizeTaskStatus(task.status) || "pending"}
                        disabled={isUpdating}
                        onChange={(e) =>
                          updateTaskStatus(task.id, e.target.value)
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`h-7 w-full rounded-full border px-2 text-xs font-semibold outline-none transition-colors focus:border-blue-300 focus:bg-white disabled:bg-slate-100 ${getStatusStyle(
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
                    <td className="h-14 whitespace-nowrap px-2 py-2 text-center align-middle text-xs text-slate-400">
                      {task.completed_date || "-"}
                    </td>
                    <td className="h-12 px-1 py-1.5 align-middle">
                      <div className="flex flex-nowrap items-center justify-center gap-1">
                        <span
                          draggable={!isUpdating}
                          onDragStart={() => setDraggingTaskId(task.id)}
                          onDragEnd={() => setDraggingTaskId(null)}
                          className="flex h-6 w-6 shrink-0 cursor-grab select-none items-center justify-center rounded-md border border-transparent bg-transparent text-slate-300 transition-colors hover:border-slate-200 hover:bg-white hover:text-slate-500"
                          title="드래그해서 순서 변경"
                        >
                          <GripVertical size={14} />
                        </span>
                        <button
                          type="button"
                          onClick={() => duplicateTask(task)}
                          disabled={isUpdating}
                          aria-label={`${task.task_name || "업무"} 복제`}
                          title="업무 복제"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-blue-600 hover:border-blue-200 hover:bg-blue-50 disabled:text-slate-300"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          disabled={isUpdating}
                          aria-label={`${task.task_name || "업무"} 삭제`}
                          title="업무 삭제"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:text-red-300"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sectionTasks.length === 0 && (
                <tr>
                    <td colSpan={10} className="p-0">
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
            </div>}
          </section>
          );
        })}
        {assemblyVendors.length === 0 && <EmptyState message="등록된 조립업체가 없습니다. 프로젝트 수정에서 조립업체를 먼저 등록하세요." />}
        {tasks.some((task) => task.project_section_id == null) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <b>공정 미지정 레거시 업무 {tasks.filter((task) => task.project_section_id == null).length}건</b>
            <p className="mt-1 text-xs">데이터 보호를 위해 자동 배정하지 않았습니다: {tasks.filter((task) => task.project_section_id == null).map((task) => task.task_name || `업무 #${task.id}`).join(", ")}</p>
          </div>
        )}
        {tasks.some((task) => task.project_assembly_vendor_id == null) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <b>조립업체 미지정 레거시 업무 {tasks.filter((task) => task.project_assembly_vendor_id == null).length}건</b>
            <p className="mt-1 text-xs">조립업체가 없는 프로젝트의 기존 업무는 호환성을 위해 미지정 상태로 유지됩니다.</p>
          </div>
        )}
        {sections.length === 0 && <EmptyState message="등록된 공정이 없습니다." />}
        </div>
      </div>

      <ProjectFiles projectId={projectId} />

      <CollapsibleSection
        id="project-activity"
        title="최근 활동"
        count={recentActivityCount}
        open={isRecentActivityOpen}
        onToggle={() => setIsRecentActivityOpen((current) => !current)}
      >
        <p className="mb-3 text-sm text-slate-500">이 프로젝트의 최신 활동 10건입니다.</p>
        <ActivityTimeline limit={10} projectId={Number(projectId)} onCountChange={setRecentActivityCount} />
      </CollapsibleSection>

      <CollapsibleSection
        id="project-history"
        title="변경 이력"
        count={changeHistoryCount}
        open={isChangeHistoryOpen}
        onToggle={() => setIsChangeHistoryOpen((current) => !current)}
      >
        <p className="mb-3 text-sm text-slate-500">실제 값이 변경된 프로젝트, 업무 및 출고 이력입니다.</p>
        <ActivityTimeline
          limit={30}
          projectId={Number(projectId)}
          historyOnly
          onCountChange={setChangeHistoryCount}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="project-timeline"
        title="타임라인"
        open={isTimelineOpen}
        onToggle={() => setIsTimelineOpen((current) => !current)}
      >
        <p className="mb-4 text-sm text-slate-500">프로젝트 생성부터 완료까지의 핵심 이벤트를 시간순으로 확인합니다.</p>
        <ProjectTimeline projectId={Number(projectId)} />
      </CollapsibleSection>

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
          assemblyVendors={assemblyVendors}
          saving={isSavingSection}
          assemblyVendorLocked={sectionDialog.vendor !== null}
          initialValue={sectionDialog.mode === "edit" && sectionDialog.target && sectionDialog.vendor
            ? vendorSectionValue(sectionDialog.target, sectionDialog.vendor)
            : sectionDialog.mode === "edit" && sectionDialog.target ? {
            process_type: sectionDialog.target.process_type,
            assembly_vendor: sectionDialog.vendor?.organizationName ?? sectionDialog.target.assembly_vendor,
            task_manager: sectionDialog.target.task_manager,
            quantity: sectionDialog.target.quantity,
            start_date: sectionDialog.target.start_date,
            end_date: sectionDialog.target.end_date,
            memo: sectionDialog.target.memo,
            targetAssemblyVendorIds: null,
          } : {
            ...emptySectionValue(sectionDialog.source),
            process_type: "",
            assembly_vendor: sectionDialog.vendor?.organizationName ?? emptySectionValue(sectionDialog.source).assembly_vendor,
          }}
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
                {assemblyVendors.find((vendor) => vendor.id === selectedTaskVendorId)?.organizationName || "선택 업체"}에 업무명, 유형, 담당자와 일정을 입력합니다.
              </p>
            </div>

            <div className="space-y-3">
              <select
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                value={selectedTaskSectionId ?? ""}
                onChange={(event) => setSelectedTaskSectionId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">공정 선택</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>{processTypes.find((process) => process.code === section.process_type)?.name ?? section.process_type}</option>
                ))}
              </select>
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
                  setTaskForm({
                    ...taskForm,
                    task_type: e.target.value,
                    quantity: e.target.value.includes("출고") ? taskForm.quantity : "",
                  })
                }
              />
              {taskForm.task_type.includes("출고") && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>프로젝트 수량</span>
                    <span className="text-right font-medium">{formatProjectQuantity(project.quantity, project.quantity_unit)}</span>
                    <span>기존 출고 예정</span>
                    <span className="text-right font-medium">{formatProjectQuantity(newTaskShipmentSummary.existingShipmentTotal, project.quantity_unit)}</span>
                    <span>최대 입력 가능</span>
                    <span className="text-right font-medium">{formatProjectQuantity(newTaskShipmentSummary.maxInputQuantity, project.quantity_unit)}</span>
                    <span>예상 출고 합계</span>
                    <span className="text-right font-medium">{formatProjectQuantity(newTaskShipmentSummary.expectedShipmentTotal, project.quantity_unit)}</span>
                    <span>{newTaskShipmentSummary.isExceeded ? "초과 수량" : "입력 후 잔여"}</span>
                    <span className={`text-right font-semibold ${newTaskShipmentSummary.isExceeded ? "text-red-600" : "text-slate-700"}`}>
                      {formatProjectQuantity(
                        newTaskShipmentSummary.isExceeded
                          ? newTaskShipmentSummary.exceededQuantity
                          : newTaskShipmentSummary.remainingQuantity,
                        project.quantity_unit
                      )}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    max={newTaskShipmentSummary.maxInputQuantity ?? undefined}
                    inputMode="numeric"
                    className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none transition-colors ${
                      newTaskShipmentSummary.isExceeded
                        ? "border-red-300 text-red-700 focus:border-red-400"
                        : "border-slate-200 focus:border-blue-300"
                    }`}
                    placeholder="비워두면 전체 수량"
                    value={taskForm.quantity}
                    onChange={(event) => setTaskForm({ ...taskForm, quantity: event.target.value })}
                  />
                  {newTaskShipmentSummary.isExceeded && (
                    <p className="mt-2 text-xs font-medium text-red-600">프로젝트 수량을 초과했습니다. 출고 수량을 확인해주세요.</p>
                  )}
                  {newTaskShipmentSummary.projectQuantity !== null
                    && newTaskShipmentSummary.remainingQuantity === 0
                    && !newTaskShipmentSummary.isExceeded
                    && <p className="mt-2 text-xs text-blue-600">전체 수량이 출고 예정으로 배정되었습니다.</p>}
                  {newTaskShipmentSummary.hasBlankShipmentTask && newTaskShipmentSummary.hasQuantityShipmentTask && (
                    <p className="mt-2 text-xs text-amber-700">수량이 비어 있는 출고 업무는 전체 수량으로 출고될 수 있으니 확인해주세요.</p>
                  )}
                </div>
              )}
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
              <DatePicker
                value={taskForm.start_date || null}
                onSave={(date) =>
                  setTaskForm((current) => ({
                    ...current,
                    start_date: date || "",
                  }))
                }
                placeholder="시작일 선택"
                className="w-full"
              />
              <DatePicker
                value={taskForm.due_date || null}
                onSave={(date) =>
                  setTaskForm((current) => ({
                    ...current,
                    due_date: date || "",
                  }))
                }
                placeholder="마감일 선택"
                className="w-full"
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
              <textarea
                className="min-h-20 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                placeholder="업무 메모 (선택)"
                value={taskForm.note}
                onChange={(event) => setTaskForm({ ...taskForm, note: event.target.value })}
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => { setShowTaskModal(false); setSelectedTaskVendorId(null); setSelectedTaskSectionId(null); }}
                disabled={isSavingTask}
                className="rounded-2xl px-4 py-2 text-sm"
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={addTask}
                disabled={isSavingTask || (
                  taskForm.task_type.includes("출고")
                  && taskForm.quantity.trim() !== ""
                  && (
                    newTaskInputQuantity === null
                    || !Number.isInteger(newTaskInputQuantity)
                    || newTaskInputQuantity <= 0
                    || newTaskShipmentSummary.projectQuantity === null
                    || newTaskShipmentSummary.isExceeded
                  )
                )}
                className="rounded-2xl px-4 py-2 text-sm"
              >
                {isSavingTask ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {noteTask && (
        <TaskNotesDrawer
          taskId={noteTask.id}
          taskName={noteTask.task_name || "업무명 없음"}
          projectId={noteTask.project_id}
          onClose={() => setNoteTask(null)}
          onSummaryChange={handleTaskNoteSummaryChange}
        />
      )}
    </div>
  );
}
