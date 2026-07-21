"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderPlus,
  ListPlus,
  Loader2,
  Megaphone,
  Search,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { addActivity } from "@/lib/activity";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import {
  PROJECT_FILE_TYPES,
  type ProjectFileType,
  uploadProjectFile,
} from "@/lib/files";
import { supabase } from "@/lib/supabase";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import {
  getProjectStatusLabel,
  getTaskStatusLabel,
  isTaskCompleted,
  isTaskInProgress,
  normalizeProjectStatus,
} from "@/lib/status";
import { recordRecentTask } from "@/lib/recent";

export type QuickCreateInitialView = "project" | "task" | "file";

type QuickCreateProps = {
  isOpen: boolean;
  onClose: () => void;
  initialView?: QuickCreateInitialView;
  contextProjectId?: number | null;
  stayOnPage?: boolean;
};

type ViewMode = "menu" | "project" | "task" | "employee" | "notice" | "file";

type TaskForm = {
  task_name: string;
  task_type: string;
  assignee: string;
  start_date: string;
  due_date: string;
  status: string;
};

type EmployeeForm = {
  name: string;
  email: string;
  role: string;
  position: string;
  active: boolean;
};

type FileForm = {
  fileType: ProjectFileType;
  description: string;
};

type ProjectOption = {
  id: number;
  project_code: string | null;
  project_name: string;
  assembly_vendor: string | null;
  status: string | null;
  created_at: string | null;
};

type EmployeeOption = {
  id: number;
  name: string;
  active: boolean | null;
};

type ExistingTask = {
  id: number;
  task_order: number | null;
  status: string | null;
};

const initialTaskForm: TaskForm = {
  task_name: "",
  task_type: "",
  assignee: "",
  start_date: "",
  due_date: "",
  status: "pending",
};

const initialEmployeeForm: EmployeeForm = {
  name: "",
  email: "",
  role: "member",
  position: "",
  active: true,
};

const initialFileForm: FileForm = {
  fileType: "drawing",
  description: "",
};

const taskTypes = ["설계", "구매", "제작", "조립", "검수", "출고", "기타"];
const taskStatuses = ["pending", "in_progress", "completed"];
const employeeRoles = ["admin", "manager", "member", "viewer"];
const acceptedFileTypes = [
  "application/pdf",
  "image/*",
  ".xls",
  ".xlsx",
  ".doc",
  ".docx",
  ".hwp",
  ".hwpx",
  ".dwg",
  ".dxf",
].join(",");

function getSupabaseMessage(message: string) {
  return message || "저장 중 오류가 발생했습니다.";
}

function isTaskFormDirty(form: TaskForm, selectedProject: ProjectOption | null) {
  return (
    selectedProject !== null ||
    form.task_name.trim() !== "" ||
    form.task_type.trim() !== "" ||
    form.assignee.trim() !== "" ||
    form.start_date !== "" ||
    form.due_date !== "" ||
    form.status !== initialTaskForm.status
  );
}

function isEmployeeFormDirty(form: EmployeeForm) {
  return (
    form.name.trim() !== "" ||
    form.email.trim() !== "" ||
    form.role !== initialEmployeeForm.role ||
    form.position.trim() !== "" ||
    form.active !== initialEmployeeForm.active
  );
}

function isFileFormDirty(
  form: FileForm,
  selectedProject: ProjectOption | null,
  selectedFile: File | null
) {
  return (
    selectedProject !== null ||
    selectedFile !== null ||
    form.fileType !== initialFileForm.fileType ||
    form.description.trim() !== ""
  );
}

function getNextProjectStatus(tasks: Array<{ status: string | null }>) {
  if (tasks.length === 0) return "pending";

  const isAllCompleted = tasks.every((task) => isTaskCompleted(task.status));
  const hasActiveOrCompleted = tasks.some(
    (task) => isTaskInProgress(task.status) || isTaskCompleted(task.status)
  );

  if (isAllCompleted) return "completed";
  if (hasActiveOrCompleted) return "in_progress";

  return "pending";
}

export default function QuickCreate({
  isOpen,
  onClose,
  initialView,
  contextProjectId,
  stayOnPage = false,
}: QuickCreateProps) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("menu");
  const [currentEmployee, setCurrentEmployee] = useState<CurrentEmployee | null>(
    null
  );
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [projectFormDirty, setProjectFormDirty] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskForm>(initialTaskForm);
  const [employeeForm, setEmployeeForm] =
    useState<EmployeeForm>(initialEmployeeForm);
  const [fileForm, setFileForm] = useState<FileForm>(initialFileForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(
    null
  );
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const canCreate = Boolean(currentEmployee && currentEmployee.active !== false);
  const isDirty =
    view === "project"
      ? projectFormDirty
      : view === "task"
        ? isTaskFormDirty(taskForm, selectedProject)
        : view === "employee"
          ? isEmployeeFormDirty(employeeForm)
          : view === "file"
            ? isFileFormDirty(fileForm, selectedProject, selectedFile)
            : false;

  const resetState = useCallback(() => {
    setView("menu");
    setErrorMessage("");
    setProjectFormDirty(false);
    setTaskForm(initialTaskForm);
    setEmployeeForm(initialEmployeeForm);
    setFileForm(initialFileForm);
    setSelectedFile(null);
    setProjectQuery("");
    setProjectOptions([]);
    setSelectedProject(null);
  }, []);

  const closeModal = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const requestClose = useCallback(() => {
    if (!isDirty || window.confirm("입력 중인 내용이 있습니다. 닫을까요?")) {
      closeModal();
    }
  }, [closeModal, isDirty]);

  const goToMenu = useCallback(() => {
    setErrorMessage("");
    setProjectFormDirty(false);
    setTaskForm(initialTaskForm);
    setEmployeeForm(initialEmployeeForm);
    setFileForm(initialFileForm);
    setSelectedFile(null);
    setProjectQuery("");
    setProjectOptions([]);
    setSelectedProject(null);
    setView("menu");
  }, []);

  const openView = useCallback((nextView: Exclude<ViewMode, "menu">) => {
    setErrorMessage("");
    setProjectFormDirty(false);
    setTaskForm(initialTaskForm);
    setEmployeeForm(initialEmployeeForm);
    setFileForm(initialFileForm);
    setSelectedFile(null);
    setProjectQuery("");
    setProjectOptions([]);
    setSelectedProject(null);
    setView(nextView);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const viewTimer = window.setTimeout(() => {
      setView(initialView ?? "menu");
    }, 0);

    let isMounted = true;

    async function loadAuth() {
      setIsLoadingAuth(true);
      const employee = await getCurrentEmployee();

      if (isMounted) {
        setCurrentEmployee(employee);
        setIsLoadingAuth(false);
      }
    }

    void loadAuth();

    return () => {
      window.clearTimeout(viewTimer);
      isMounted = false;
    };
  }, [initialView, isOpen]);

  useEffect(() => {
    if (!isOpen || (view !== "task" && view !== "file")) return;

    let isMounted = true;

    async function loadProjects() {
      const searchText = projectQuery.replace(/[%,]/g, " ").trim();
      let query = supabase
        .from("projects")
        .select(
          "id, project_code, project_name, assembly_vendor, status, created_at"
        )
        .limit(8);

      if (contextProjectId && !searchText) {
        query = query.eq("id", contextProjectId);
      } else if (searchText) {
        query = query.or(
          `project_name.ilike.%${searchText}%,project_code.ilike.%${searchText}%,assembly_vendor.ilike.%${searchText}%`
        );
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query;

      if (!isMounted) return;

      if (error) {
        setErrorMessage(getSupabaseMessage(error.message));
        return;
      }

      const loadedProjects = (data || []) as ProjectOption[];
      setProjectOptions(loadedProjects);
      if (contextProjectId && !searchText) {
        setSelectedProject(
          loadedProjects.find((project) => project.id === contextProjectId) ??
            null
        );
      }
    }

    void loadProjects();

    return () => {
      isMounted = false;
    };
  }, [contextProjectId, isOpen, projectQuery, view]);

  useEffect(() => {
    if (!isOpen || view !== "task") return;

    let isMounted = true;

    async function loadEmployees() {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setErrorMessage(getSupabaseMessage(error.message));
        return;
      }

      setEmployees((data || []) as EmployeeOption[]);
    }

    void loadEmployees();

    return () => {
      isMounted = false;
    };
  }, [isOpen, view]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();

      if (view === "menu") {
        requestClose();
        return;
      }

      goToMenu();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToMenu, isOpen, requestClose, view]);

  const selectedProjectLabel = useMemo(() => {
    if (!selectedProject) return "프로젝트를 선택하세요.";

    return `${selectedProject.project_name} (${selectedProject.project_code || "코드 없음"})`;
  }, [selectedProject]);

  async function createTask() {
    if (isSaving) return;

    if (!selectedProject) {
      setErrorMessage("프로젝트를 선택하세요.");
      return;
    }

    if (!taskForm.task_name.trim()) {
      setErrorMessage("업무명을 입력하세요.");
      return;
    }

    if (!taskForm.task_type.trim()) {
      setErrorMessage("업무유형을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, task_order, status")
      .eq("project_id", selectedProject.id)
      .order("task_order", { ascending: true, nullsFirst: false });

    if (tasksError) {
      setErrorMessage(getSupabaseMessage(tasksError.message));
      setIsSaving(false);
      return;
    }

    const existingTasks = (tasks || []) as ExistingTask[];
    const maxOrder =
      existingTasks.length > 0
        ? Math.max(...existingTasks.map((task) => task.task_order || 0))
        : 0;
    const savedAssignee =
      taskForm.assignee === "미배정" || taskForm.assignee.trim() === ""
        ? null
        : taskForm.assignee.trim();

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .insert([
        {
          project_id: selectedProject.id,
          task_order: maxOrder + 1,
          task_name: taskForm.task_name.trim(),
          task_type: taskForm.task_type.trim(),
          assignee: savedAssignee,
          status: taskForm.status,
          start_date: taskForm.start_date || null,
          due_date: taskForm.due_date || null,
          completed_date: isTaskCompleted(taskForm.status)
            ? new Date().toISOString().slice(0, 10)
            : null,
        },
      ])
      .select("id, task_order, status")
      .single();

    if (taskError || !taskData) {
      setErrorMessage(getSupabaseMessage(taskError?.message || ""));
      setIsSaving(false);
      return;
    }

    const nextProjectStatus = getNextProjectStatus([
      ...existingTasks,
      taskData as ExistingTask,
    ]);

    if (normalizeProjectStatus(selectedProject.status) !== nextProjectStatus) {
      const { error: projectStatusError } = await supabase
        .from("projects")
        .update({ status: nextProjectStatus })
        .eq("id", selectedProject.id);

      if (projectStatusError) {
        setErrorMessage(getSupabaseMessage(projectStatusError.message));
        setIsSaving(false);
        return;
      }
    }

    void recordRecentTask({
      task_id: (taskData as ExistingTask).id,
      project_id: selectedProject.id,
      project_name: selectedProject.project_name,
      task_name: taskForm.task_name.trim(),
      task_type: taskForm.task_type.trim(),
      assignee: savedAssignee,
      status: taskForm.status,
      due_date: taskForm.due_date || null,
    });

    await addActivity({
      type: "task_create",
      title: "업무 생성",
      description: `${taskForm.task_name.trim()} 업무를 생성했습니다.`,
      projectId: selectedProject.id,
      targetType: "task",
      targetId: (taskData as ExistingTask).id,
    });

    closeModal();
    if (stayOnPage) router.refresh();
    else router.push(`/projects/${selectedProject.id}`);
    setIsSaving(false);
  }

  async function createEmployee() {
    if (isSaving) return;

    if (!employeeForm.name.trim()) {
      setErrorMessage("이름을 입력하세요.");
      return;
    }

    if (!employeeForm.email.trim()) {
      setErrorMessage("이메일을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const { data: employeeData, error } = await supabase
      .from("employees")
      .insert([
        {
          name: employeeForm.name.trim(),
          email: employeeForm.email.trim(),
          position: employeeForm.position.trim() || null,
          role: employeeForm.role,
          active: employeeForm.active,
        },
      ])
      .select("id")
      .single();

    if (error || !employeeData) {
      setErrorMessage(getSupabaseMessage(error?.message || ""));
      setIsSaving(false);
      return;
    }

    await addActivity({
      actionType: "employee_create",
      targetType: "employee",
      targetId: employeeData.id as number,
      title: "직원 등록",
      description: `${employeeForm.name.trim()} 직원을 등록했습니다.`,
    });

    closeModal();
    router.push("/employees");
    setIsSaving(false);
  }

  async function uploadFile() {
    if (isSaving) return;

    if (!selectedProject) {
      setErrorMessage("프로젝트를 선택하세요.");
      return;
    }

    if (!selectedFile) {
      setErrorMessage("업로드할 파일을 선택하세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      await uploadProjectFile({
        projectId: selectedProject.id,
        file: selectedFile,
        fileType: fileForm.fileType,
        description: fileForm.description,
        uploaderName: currentEmployee?.name ?? null,
        uploaderEmail: currentEmployee?.email ?? null,
      });

      closeModal();
      if (stayOnPage) router.refresh();
      else router.push(`/projects/${selectedProject.id}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "파일 업로드 중 오류가 발생했습니다.";
      setErrorMessage(message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6"
      onMouseDown={requestClose}
    >
      <div
        className={`max-h-[88vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl ${
          view === "project" ? "max-w-5xl" : "max-w-2xl"
        }`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">
              Quick Create
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {view === "menu"
                ? "빠른 등록"
                : view === "project"
                  ? "새 프로젝트"
                  : view === "task"
                    ? "새 업무"
                    : view === "employee"
                      ? "새 직원"
                      : view === "notice"
                        ? "새 공지"
                        : "파일 업로드"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {view !== "menu" && (
              <button
                type="button"
                onClick={goToMenu}
                className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="빠른 등록 첫 화면으로 이동"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={requestClose}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="빠른 등록 닫기"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        )}

        {!canCreate && !isLoadingAuth && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            현재 직원 정보가 확인되지 않아 빠른 등록을 사용할 수 없습니다.
          </div>
        )}

        {view === "menu" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canCreate || isLoadingAuth}
              onClick={() => openView("project")}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderPlus size={22} className="text-blue-600" />
              <p className="mt-3 text-sm font-bold text-slate-900">새 프로젝트</p>
              <p className="mt-1 text-xs text-slate-500">
                프로젝트 기본 정보와 템플릿 업무를 함께 생성합니다.
              </p>
            </button>
            <button
              type="button"
              disabled={!canCreate || isLoadingAuth}
              onClick={() => openView("task")}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ListPlus size={22} className="text-emerald-600" />
              <p className="mt-3 text-sm font-bold text-slate-900">새 업무</p>
              <p className="mt-1 text-xs text-slate-500">
                프로젝트를 검색해 업무를 마지막 순서로 추가합니다.
              </p>
            </button>
            <button
              type="button"
              disabled={!canCreate || isLoadingAuth}
              onClick={() => openView("employee")}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-200 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus size={22} className="text-violet-600" />
              <p className="mt-3 text-sm font-bold text-slate-900">새 직원</p>
              <p className="mt-1 text-xs text-slate-500">
                실제 employees 컬럼 기준으로 최소 정보만 등록합니다.
              </p>
            </button>
            <button
              type="button"
              disabled={!canCreate || isLoadingAuth}
              onClick={() => openView("notice")}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-200 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Megaphone size={22} className="text-amber-600" />
              <p className="mt-3 text-sm font-bold text-slate-900">새 공지</p>
              <p className="mt-1 text-xs text-slate-500">
                현재 공지 저장 구조가 없어 안내 상태로 표시합니다.
              </p>
            </button>
            <button
              type="button"
              disabled={!canCreate || isLoadingAuth}
              onClick={() => openView("file")}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
            >
              <Upload size={22} className="text-sky-600" />
              <p className="mt-3 text-sm font-bold text-slate-900">파일 업로드</p>
              <p className="mt-1 text-xs text-slate-500">
                프로젝트를 선택하고 기존 project-files 저장 정책으로 업로드합니다.
              </p>
            </button>
          </div>
        )}

        {view === "project" && (
          <ProjectCreateForm
            onCancel={goToMenu}
            onDirtyChange={setProjectFormDirty}
            onSuccess={(projectId) => {
              closeModal();
              if (stayOnPage) router.refresh();
              else router.push(`/projects/${projectId}`);
            }}
          />
        )}
        {view === "task" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createTask();
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                프로젝트
                <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2">
                  <Search size={15} className="text-slate-400" />
                  <input
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                    className="w-full text-sm outline-none"
                    placeholder="프로젝트명, 코드, 조립처 검색"
                  />
                </div>
              </label>
              <div className="rounded-2xl border border-slate-200">
                {projectOptions.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-slate-500">
                    검색 결과가 없습니다.
                  </p>
                ) : (
                  projectOptions.map((project) => (
                    <button
                      type="button"
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 ${
                        selectedProject?.id === project.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <span>
                        <span className="font-semibold text-slate-900">
                          {project.project_name}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          {project.project_code || "코드 없음"}
                        </span>
                        <span className="block text-xs text-slate-500">
                          조립처 {project.assembly_vendor || "-"}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                        {getProjectStatusLabel(project.status)}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <p className="text-xs font-medium text-slate-500">
                선택: {selectedProjectLabel}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                업무명
                <input
                  value={taskForm.task_name}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, task_name: event.target.value })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                  placeholder="업무명을 입력하세요"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                업무유형
                <input
                  list="quick-create-task-types"
                  value={taskForm.task_type}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, task_type: event.target.value })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
                <datalist id="quick-create-task-types">
                  {taskTypes.map((taskType) => (
                    <option key={taskType} value={taskType} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                담당자
                <select
                  value={taskForm.assignee}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, assignee: event.target.value })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                >
                  <option value="">미배정</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.name}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                상태
                <select
                  value={taskForm.status}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, status: event.target.value })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                >
                  {taskStatuses.map((status) => (
                    <option key={status} value={status}>
                      {getTaskStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                시작일
                <input
                  type="date"
                  value={taskForm.start_date}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, start_date: event.target.value })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                종료일
                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, due_date: event.target.value })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={goToMenu}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!canCreate || isSaving}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                {isSaving && <Loader2 size={15} className="animate-spin" />}
                업무 생성
              </button>
            </div>
          </form>
        )}

        {view === "employee" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createEmployee();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                이름
                <input
                  value={employeeForm.name}
                  onChange={(event) =>
                    setEmployeeForm({
                      ...employeeForm,
                      name: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                  placeholder="직원 이름"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                이메일
                <input
                  type="email"
                  value={employeeForm.email}
                  onChange={(event) =>
                    setEmployeeForm({
                      ...employeeForm,
                      email: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                  placeholder="name@example.com"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                역할
                <select
                  value={employeeForm.role}
                  onChange={(event) =>
                    setEmployeeForm({
                      ...employeeForm,
                      role: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                >
                  {employeeRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                직급/직책
                <input
                  value={employeeForm.position}
                  onChange={(event) =>
                    setEmployeeForm({
                      ...employeeForm,
                      position: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={employeeForm.active}
                  onChange={(event) =>
                    setEmployeeForm({
                      ...employeeForm,
                      active: event.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                활성 직원
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={goToMenu}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!canCreate || isSaving}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                {isSaving && <Loader2 size={15} className="animate-spin" />}
                직원 등록
              </button>
            </div>
          </form>
        )}

        {view === "notice" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <Megaphone size={22} className="text-amber-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-900">
              공지 등록은 아직 지원되지 않습니다.
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              현재 실제 Supabase DB에 notices 테이블이 없고 공지 화면은 정적
              데이터로만 구성되어 있어 Quick Create 저장 기능을 만들지
              않았습니다.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={goToMenu}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                확인
              </button>
            </div>
          </div>
        )}

        {view === "file" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void uploadFile();
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                프로젝트
                <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2">
                  <Search size={15} className="text-slate-400" />
                  <input
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                    className="w-full text-sm outline-none"
                    placeholder="프로젝트명, 코드, 조립처 검색"
                  />
                </div>
              </label>
              <div className="rounded-2xl border border-slate-200">
                {projectOptions.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-slate-500">
                    검색 결과가 없습니다.
                  </p>
                ) : (
                  projectOptions.map((project) => (
                    <button
                      type="button"
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 ${
                        selectedProject?.id === project.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <span>
                        <span className="font-semibold text-slate-900">
                          {project.project_name}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          {project.project_code || "코드 없음"}
                        </span>
                        <span className="block text-xs text-slate-500">
                          조립처 {project.assembly_vendor || "-"}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                        {getProjectStatusLabel(project.status)}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <p className="text-xs font-medium text-slate-500">
                선택: {selectedProjectLabel}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                파일 선택
                <input
                  type="file"
                  accept={acceptedFileTypes}
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] ?? null)
                  }
                  className="mt-1 block w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 focus:border-blue-300 focus:outline-none"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                파일 분류
                <select
                  value={fileForm.fileType}
                  onChange={(event) =>
                    setFileForm({
                      ...fileForm,
                      fileType: event.target.value as ProjectFileType,
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                >
                  {PROJECT_FILE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                설명 또는 메모
                <textarea
                  value={fileForm.description}
                  onChange={(event) =>
                    setFileForm({
                      ...fileForm,
                      description: event.target.value,
                    })
                  }
                  rows={3}
                  className="mt-1 w-full resize-none rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
                  placeholder="파일에 대한 간단한 메모"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={goToMenu}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!canCreate || isSaving}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                {isSaving && <Loader2 size={15} className="animate-spin" />}
                파일 업로드
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
