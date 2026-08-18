"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { recordRecentTask } from "@/lib/recent";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  IntegratedProjectGantt,
  type GanttTaskDetail,
  type IntegratedProject,
} from "@/components/gantt/IntegratedProjectGantt";
import { GanttTaskDetailModal } from "@/components/gantt/GanttTaskDetailModal";
import { usePermission } from "@/hooks/usePermission";
import {
  getTaskStatusLabel,
  isTaskCompleted,
  isTaskInProgress,
} from "@/lib/status";
import { PROJECT_SELECT_FIELDS } from "@/lib/projects";
import { persistRecalculatedTaskOrders } from "@/lib/task-ordering";
import { COMPLETED_PERSONAL_SCHEDULE_STYLES, getCalendarMonthRange, getPersonalNoteCommentBadge, matchesCalendarSourceFilter, matchesCompletedPersonalScheduleFilter, normalizeCalendarSourceFilter, normalizeShowCompletedPersonalSchedules, PERSONAL_NOTES_CHANGED_EVENT, dispatchPersonalNotesChanged, openNoteEditor, selectPersonalNotesForCalendar, type CalendarSourceFilter, type PersonalNote } from "@/lib/personal-notes";
import { toast } from "@/lib/toast";
import { getMonthWeekLayout, getSundayFirstMonthDays } from "@/lib/calendar-grid";
import { getDday } from "@/lib/dday";
import { DdayBadge } from "@/components/ui/DdayBadge";
import { PersonalNoteDetailModal } from "@/components/workspace/PersonalNoteDetailModal";
import { PersonalNoteActions } from "@/components/workspace/PersonalNoteActions";
import { ShareDialog } from "@/components/sharing/ShareDialog";
import { COMMENT_COUNT_DELTA_EVENT, COMMENT_COUNTS_INVALIDATED_EVENT, COMMENT_UNREAD_CLEARED_EVENT, TASKS_CHANGED_EVENT } from "@/lib/collaboration-events";
import { applyCommentCounts, loadCommentCounts } from "@/lib/comment-counts";
import { withShortEditingLock } from "@/lib/editing-locks";
import { getCalendarPermissions } from "@/lib/permissions";
import { getCalendarTaskNoteDisplayPreviews, getLatestTaskNotes, shouldShowActiveImportantNoteReminder, TASK_NOTES_CHANGED_EVENT, type TaskNotePreview } from "@/lib/task-notes";

type Project = IntegratedProject & {
  completion_due_date: string | null;
};

type Task = {
  id: number;
  project_id: number;
  project_section_id?: number | null;
  project_assembly_vendor_id: number | null;
  project_assembly_vendor?: {
    id: number;
    allocated_quantity: number | null;
    organization: { name: string } | null;
  } | null;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  task_order: number | null;
  created_at: string | null;
};

type EmployeeProfile = {
  name: string;
  email: string | null;
};

type QuickFilter = "전체" | "내 업무" | "지연" | "오늘" | "이번 주";

type CalendarItem = {
  id: string;
  date: string;
  startDate?: string;
  endDate?: string;
  type: "업무일정";
  title: string;
  status: string | null;
  assignee: string;
  projectName?: string;
  assemblyVendorName?: string;
  taskType?: string | null;
  href?: string;
  memo: TaskNotePreview | null;
  taskStartDate?: string;
  taskEndDate?: string;
};

type CalendarWeekSegment = {
  item: CalendarItem;
  weekIndex: number;
  startColumn: number;
  span: number;
  laneIndex: number;
  isRangeStart: boolean;
  isRangeEnd: boolean;
};

type CalendarWeekLayout = {
  days: Array<string | null>;
  segments: CalendarWeekSegment[];
  laneCount: number;
};

const CALENDAR_PROJECT_NAME_MAX_LENGTH = 18;

function getTaskAssemblyVendorName(task: Task) {
  return task.project_assembly_vendor?.organization?.name?.trim() || "업체 미지정";
}

function getTaskCalendarTitle(project: Project | undefined, task: Task) {
  const projectName = project?.project_name.trim() || "프로젝트 미지정";
  const projectIdentifier =
    projectName.length <= CALENDAR_PROJECT_NAME_MAX_LENGTH
      ? projectName
      : project?.project_code?.trim() || `${projectName.slice(0, 12)}…`;

  return `${projectIdentifier} · ${getTaskAssemblyVendorName(task)} · ${task.task_name?.trim() || "업무명 없음"}`;
}

function splitMonthIntoWeeks(days: Array<string | null>) {
  const weeks: Array<Array<string | null>> = [];

  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

function getItemRange(item: CalendarItem) {
  const start = item.startDate || item.endDate || item.date;
  const end = item.endDate || item.startDate || item.date;

  return start <= end ? { start, end } : { start: end, end: start };
}

function buildWeekSegments(
  items: CalendarItem[],
  weeks: Array<Array<string | null>>
): CalendarWeekLayout[] {
  return weeks.map((days, weekIndex) => {
    const visibleDays = days.filter((date): date is string => date !== null);
    const weekStart = visibleDays[0];
    const weekEnd = visibleDays[visibleDays.length - 1];

    if (!weekStart || !weekEnd) {
      return { days, segments: [], laneCount: 0 };
    }

    const segments = items
      .flatMap((item) => {
        const range = getItemRange(item);
        if (range.end < weekStart || range.start > weekEnd) return [];

        const segmentStart = range.start < weekStart ? weekStart : range.start;
        const segmentEnd = range.end > weekEnd ? weekEnd : range.end;
        const startIndex = days.indexOf(segmentStart);
        const endIndex = days.indexOf(segmentEnd);
        if (startIndex < 0 || endIndex < startIndex) return [];

        return [{
          item,
          weekIndex,
          startColumn: startIndex + 1,
          span: endIndex - startIndex + 1,
          laneIndex: 0,
          isRangeStart: segmentStart === range.start,
          isRangeEnd: segmentEnd === range.end,
        }];
      })
      .sort((a, b) =>
        a.startColumn - b.startColumn ||
        b.span - a.span ||
        a.item.id.localeCompare(b.item.id)
      );

    const laneEndColumns: number[] = [];
    const assignedSegments = segments.map((segment) => {
      const segmentEndColumn = segment.startColumn + segment.span - 1;
      let laneIndex = laneEndColumns.findIndex(
        (lastEndColumn) => lastEndColumn < segment.startColumn
      );

      if (laneIndex === -1) {
        laneIndex = laneEndColumns.length;
        laneEndColumns.push(segmentEndColumn);
      } else {
        laneEndColumns[laneIndex] = segmentEndColumn;
      }

      return { ...segment, laneIndex };
    });

    return {
      days,
      segments: assignedSegments,
      laneCount: laneEndColumns.length,
    };
  });
}

const quickFilters: QuickFilter[] = ["전체", "내 업무", "지연", "오늘", "이번 주"];
const typeList = ["전체", "업무일정"];
const viewList = ["달력 보기", "타임라인 보기", "간트 보기"];
const CALENDAR_SOURCE_FILTER_KEY = "calendar-source-filter";
const SHOW_COMPLETED_PERSONAL_SCHEDULES_KEY = "showCompletedPersonalSchedules";
const sourceFilters: { value: CalendarSourceFilter; label: string }[] = [{ value: "all", label: "전체 일정" }, { value: "company", label: "회사 일정" }, { value: "my", label: "All Task" }, { value: "my_own", label: "My Task" }, { value: "shared_with_me", label: "Share Task" }];

export default function CalendarPage() {
  const { employee } = usePermission();
  const calendarPermissions = getCalendarPermissions(employee);
  const calendarReadOnly = calendarPermissions.calendarOnly;
  function padDatePart(value: number) {
    return String(value).padStart(2, "0");
  }

  function getLocalDateValue(date = new Date()) {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
      date.getDate()
    )}`;
  }

  function getLocalMonthValue(date = new Date()) {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
  }

  function parseDateValue(date: string) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatMonthLabel(month: string) {
    const [year, monthValue] = month.split("-");
    return `${year}년 ${Number(monthValue)}월`;
  }

  const [items, setItems] = useState<CalendarItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>([]);
  const [selectedPersonalNoteId, setSelectedPersonalNoteId] = useState<string | null>(null);
  const personalNoteDeepLinkHandledRef = useRef(false);
  const [shareTarget, setShareTarget] = useState<PersonalNote | null>(null);
  const [selectedTask, setSelectedTask] = useState<GanttTaskDetail | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("전체");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCompletedProjects, setShowCompletedProjects] = useState(false);
  const [currentAssignee, setCurrentAssignee] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("전체");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [viewMode, setViewMode] = useState("달력 보기");
  const [sourceFilter, setSourceFilter] = useState<CalendarSourceFilter>("all");
  const [showCompletedPersonalSchedules, setShowCompletedPersonalSchedules] = useState(true);
  const [calendarPreferenceKey, setCalendarPreferenceKey] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() =>
    getLocalMonthValue()
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    getLocalDateValue()
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requestedView = new URLSearchParams(window.location.search).get(
        "view"
      );
      if (requestedView === "gantt") setViewMode("간트 보기");
      const storedSource = normalizeCalendarSourceFilter(window.localStorage.getItem(CALENDAR_SOURCE_FILTER_KEY));
      setSourceFilter(storedSource);
      if (storedSource !== "all" && storedSource !== "company") setViewMode("달력 보기");
      void supabase.auth.getSession().then(({ data }) => {
        const userId = data.session?.user.id;
        if (!userId) return;
        const preferenceKey = `${SHOW_COMPLETED_PERSONAL_SCHEDULES_KEY}:${userId}`;
        setCalendarPreferenceKey(preferenceKey);
        setShowCompletedPersonalSchedules(normalizeShowCompletedPersonalSchedules(window.localStorage.getItem(preferenceKey)));
      });
    }, 0);
    // 초기 로더는 아래 함수 선언을 참조하며 컴포넌트 수명 동안 교체되지 않습니다.
    // eslint-disable-next-line react-hooks/immutability
    void loadCalendar();
    // eslint-disable-next-line react-hooks/immutability
    void loadCurrentAssignee();
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPersonalNotes() {
      const { start: dueStart, end: dueEnd } = getCalendarMonthRange(currentMonth);
      const response = await fetch(`/api/personal-notes?dueStart=${dueStart}&dueEnd=${dueEnd}`, { cache: "no-store" });
      const result = await response.json() as { notes?: PersonalNote[]; error?: string };
      if (!active) return;
      if (!response.ok) { toast.error(result.error ?? "개인 일정을 불러오지 못했습니다."); return; }
      setPersonalNotes(selectPersonalNotesForCalendar(result.notes ?? [], dueStart, dueEnd));
    }
    function handleChanged() { void loadPersonalNotes(); }
    const timer = window.setTimeout(() => void loadPersonalNotes(), 0);
    window.addEventListener(PERSONAL_NOTES_CHANGED_EVENT, handleChanged);
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener(PERSONAL_NOTES_CHANGED_EVENT, handleChanged); };
  }, [currentMonth]);

  async function loadCurrentAssignee() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const email = session?.user?.email ?? null;

    if (!email) {
      setCurrentAssignee(null);
      return;
    }

    const { data, error } = await supabase
      .from("employees")
      .select("name, email")
      .eq("email", email)
      .maybeSingle();

    if (error || !data) {
      setCurrentAssignee(email);
      return;
    }

    const profile = data as EmployeeProfile;
    setCurrentAssignee(profile.name || profile.email || email);
  }

  async function loadCalendar() {
    setIsLoading(true);

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select(PROJECT_SELECT_FIELDS);

    if (projectError) {
      alert(projectError.message);
      setIsLoading(false);
      return;
    }

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select(
        "id, project_id, project_section_id, project_assembly_vendor_id, task_order, task_name, task_type, assignee, status, start_date, due_date, completed_date, created_at, project_assembly_vendor:project_assembly_vendors(id, allocated_quantity, organization:organizations(name))"
      );

    if (taskError) {
      alert(taskError.message);
      setIsLoading(false);
      return;
    }

    const calendarProjects = (projectData || []) as Project[];
    const calendarTasks = (taskData || []) as unknown as Task[];
    const noteResult = calendarTasks.length ? await supabase.from("task_notes").select("id, task_id, note, is_important, check_date, created_at, created_by_name").in("task_id", calendarTasks.map((task) => task.id)) : { data: [], error: null };
    if (noteResult.error) toast.error(noteResult.error.message);
    const taskNotes = (noteResult.data ?? []).map((note) => ({ id: String(note.id), taskId: Number(note.task_id), note: String(note.note), isImportant: Boolean(note.is_important), checkDate: note.check_date ? String(note.check_date) : null, createdAt: String(note.created_at), createdByName: note.created_by_name ? String(note.created_by_name) : null }));
    const latestNotes = getLatestTaskNotes(taskNotes);
    const calendarDisplayNotes = getCalendarTaskNoteDisplayPreviews(taskNotes);

    setProjects(calendarProjects);
    setTasks(calendarTasks);

    const projectById = new Map(
      calendarProjects.map((project) => [project.id, project])
    );

    const taskItems: CalendarItem[] = calendarTasks.flatMap((task) => {
      const project = projectById.get(task.project_id);
      const projectName = project?.project_name || "-";
      const title = getTaskCalendarTitle(project, task);
      const common = {
        title,
        status: task.status,
        assignee: task.assignee || "미지정",
        projectName,
        assemblyVendorName: getTaskAssemblyVendorName(task),
        taskType: task.task_type,
        href: `/projects/${task.project_id}`,
        memo: calendarDisplayNotes.get(task.id) ?? null,
      };
      const startDate = task.start_date || task.due_date;
      const endDate = task.due_date || task.start_date;
      if (!startDate || !endDate) return [];

      return [{
        ...common,
        id: `task-${task.id}`,
        date: endDate,
        startDate,
        endDate,
        type: "업무일정" as const,
      }];
    });

    const checkItems: CalendarItem[] = calendarTasks.flatMap((task) => {
      const project = projectById.get(task.project_id);
      return (noteResult.data ?? []).filter((note) => Number(note.task_id) === task.id && note.check_date).map((note) => ({ id: `task-note-${note.id}`, date: String(note.check_date), startDate: String(note.check_date), endDate: String(note.check_date), type: "업무일정" as const, title: `${Boolean(note.is_important) ? "⚠" : "📝"} 확인 · ${task.task_name || "업무명 없음"} · ${String(note.note)}`, status: task.status, assignee: task.assignee || "미지정", projectName: project?.project_name || "-", assemblyVendorName: getTaskAssemblyVendorName(task), taskType: task.task_type, href: `/projects/${task.project_id}?task=${task.id}&note=${note.id}`, memo: { id: String(note.id), taskId: task.id, note: String(note.note), isImportant: Boolean(note.is_important), checkDate: String(note.check_date), createdAt: String(note.created_at), createdByName: note.created_by_name ? String(note.created_by_name) : null } }));
    });
    const activeImportantItems: CalendarItem[] = calendarTasks.flatMap((task) => {
      const latestNote = latestNotes.get(task.id);
      if (!shouldShowActiveImportantNoteReminder({ startDate: task.start_date, endDate: task.due_date, completed: isTaskCompleted(task.status) }, latestNote, today)) return [];
      const project = projectById.get(task.project_id);
      return [{ id: `task-note-active-${latestNote?.id}-${today}`, date: today, startDate: today, endDate: today, taskStartDate: task.start_date ?? undefined, taskEndDate: task.due_date ?? undefined, type: "업무일정" as const, title: `⚠ 진행 메모 · ${task.task_name || "업무명 없음"}`, status: task.status, assignee: task.assignee || "미지정", projectName: project?.project_name || "-", assemblyVendorName: getTaskAssemblyVendorName(task), taskType: task.task_type, href: `/projects/${task.project_id}?task=${task.id}&note=${latestNote?.id}`, memo: latestNote ?? null }];
    });
    const calendarItems = [...taskItems, ...checkItems, ...activeImportantItems].sort((a, b) => a.date.localeCompare(b.date));

    setItems(calendarItems);
    setIsLoading(false);
  }

  useEffect(() => {
    const handleChanged = () => { void loadCalendar(); };
    window.addEventListener(TASK_NOTES_CHANGED_EVENT, handleChanged);
    window.addEventListener(TASKS_CHANGED_EVENT, handleChanged);
    return () => { window.removeEventListener(TASK_NOTES_CHANGED_EVENT, handleChanged); window.removeEventListener(TASKS_CHANGED_EVENT, handleChanged); };
  });

  function getTaskIdFromCalendarItem(item: CalendarItem) {
    if (item.id.startsWith("task-note-")) return item.memo?.taskId ?? null;
    if (item.id.startsWith("task-")) {
      return Number(item.id.replace("task-", ""));
    }

    return null;
  }

  function isTaskCalendarItem(item: CalendarItem) {
    return getTaskIdFromCalendarItem(item) !== null;
  }

  function getDelayedDays(task: Task) {
    if (isTaskCompleted(task.status) || !task.due_date) {
      return null;
    }
    const dday = getDday(task.due_date, today);
    return dday?.isExpired ? Math.abs(dday.diff) : null;
  }

  function openTaskDetailModal(item: CalendarItem) {
    const taskId = getTaskIdFromCalendarItem(item);
    if (taskId === null || Number.isNaN(taskId)) return;

    const task = tasks.find((taskItem) => taskItem.id === taskId);
    if (!task) return;

    const project = projects.find(
      (projectItem) => projectItem.id === task.project_id
    );
    const dueDate = task.due_date || item.date || "";
    const startDate = task.start_date || dueDate;

    setSelectedTask({
      taskId: task.id,
      projectId: task.project_id,
      projectName: project?.project_name || item.projectName || "-",
      assemblyVendorName: getTaskAssemblyVendorName(task),
      projectCode: project?.project_code || null,
      taskName: task.task_name,
      taskType: task.task_type,
      assignee: task.assignee,
      startDate,
      dueDate,
      status: task.status,
      completedDate: task.completed_date,
      delayedDays: getDelayedDays(task),
      taskTypeClassName: "bg-slate-100 text-slate-700 ring-slate-200",
      memo: item.memo?.note ?? null,
      memoIsImportant: item.memo?.isImportant ?? false,
    });
  }

  function getTypeStyle(type: string) {
    if (type === "업무일정") {
      return "bg-slate-50 text-slate-700 border-slate-200";
    }

    return "bg-green-100 text-green-700 border-green-300";
  }

  function getDisplayType(type: string) {
    return type;
  }

  function matchesTypeFilter(item: CalendarItem) {
    if (typeFilter === "전체") return true;

    if (typeFilter === "업무일정") {
      return item.type === "업무일정";
    }

    return item.type === typeFilter;
  }

  function isCompletedFilterTarget(item: CalendarItem) {
    return isTaskCompleted(item.status);
  }

  function getTaskDueLabel(item: CalendarItem) {
    if (isTaskCompleted(item.status)) return "완료";
    return getDday(item.date, today)?.label ?? "-";
  }

  function getTaskDueClassName(item: CalendarItem) {
    if (isTaskCompleted(item.status)) {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (item.date < today) {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (item.date === today) {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  function getTaskStatusVariant(status: string | null): BadgeVariant {
    if (isTaskCompleted(status)) return "success";
    if (isTaskInProgress(status)) return "info";
    return "default";
  }

  function getCalendarItemPriority(item: CalendarItem) {
    if (item.type !== "업무일정") return 3;
    if (isTaskCompleted(item.status)) return 4;
    if (item.date < today) return 1;
    if (item.date === today) return 2;
    return 3;
  }

  function getWeekRange(date: string) {
    const baseDate = parseDateValue(date);
    const mondayIndex = (baseDate.getDay() + 6) % 7;
    const startDate = new Date(baseDate);
    const endDate = new Date(baseDate);

    startDate.setDate(baseDate.getDate() - mondayIndex);
    endDate.setDate(startDate.getDate() + 6);

    return {
      start: getLocalDateValue(startDate),
      end: getLocalDateValue(endDate),
    };
  }

  function matchesQuickFilter(item: CalendarItem) {
    if (quickFilter === "전체") return true;

    if (quickFilter === "내 업무") {
      return Boolean(currentAssignee) && item.assignee === currentAssignee;
    }

    if (quickFilter === "지연") {
      return item.type === "업무일정" && !isTaskCompleted(item.status) && item.date < today;
    }

    if (quickFilter === "오늘") {
      return !isTaskCompleted(item.status) && item.date === today;
    }

    const { start, end } = getWeekRange(today);
    return item.date >= start && item.date <= end;
  }

  function moveMonth(direction: "prev" | "next") {
    const [year, month] = currentMonth.split("-").map(Number);
    const baseDate = new Date(year, month - 1, 1);

    if (direction === "prev") {
      baseDate.setMonth(baseDate.getMonth() - 1);
    } else {
      baseDate.setMonth(baseDate.getMonth() + 1);
    }

    const nextMonth = getLocalMonthValue(baseDate);

    setCurrentMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }

  function selectMonth(month: string) {
    if (!month) return;

    setCurrentMonth(month);
    setSelectedDate(`${month}-01`);
  }

  function goToday() {
    setCurrentMonth(today.slice(0, 7));
    setSelectedDate(today);
  }

  function changeViewMode(nextView: string) {
    setViewMode(nextView);
    if (nextView === "달력 보기") {
      goToday();
    }
  }

  function getCalendarDays() {
    return getSundayFirstMonthDays(currentMonth);
  }

  const today = getLocalDateValue();
  const assigneeList = useMemo(() => {
    const names = items.map((item) => item.assignee);
    return ["전체", ...Array.from(new Set(names))];
  }, [items]);

  const filteredItems = items.filter((item) => {
    const quickMatched = matchesQuickFilter(item);
    const typeMatched = matchesTypeFilter(item);
    const assigneeMatched =
      assigneeFilter === "전체" || item.assignee === assigneeFilter;

    return quickMatched && typeMatched && assigneeMatched;
  });

  const calendarVisibleItems = filteredItems.filter((item) =>
    showCompleted || !isCompletedFilterTarget(item)
  );
  const currentViewItems = viewMode === "달력 보기" ? calendarVisibleItems : filteredItems;

  const ganttTaskIds = useMemo(
    () =>
      new Set(
        filteredItems
          .map(getTaskIdFromCalendarItem)
          .filter((taskId): taskId is number => taskId !== null && !Number.isNaN(taskId))
      ),
    [filteredItems]
  );

  function handleGanttTaskUpdated(updatedTask: Task) {
    const project = projects.find((project) => project.id === updatedTask.project_id);
    const projectName = project?.project_name || "-";
    void recordRecentTask({
      task_id: updatedTask.id,
      project_id: updatedTask.project_id,
      project_name: projectName,
      task_name: updatedTask.task_name,
      task_type: updatedTask.task_type,
      assignee: updatedTask.assignee,
      status: updatedTask.status,
      due_date: updatedTask.due_date,
    });
    const taskTitle = getTaskCalendarTitle(project, updatedTask);
    const taskScheduleItems: CalendarItem[] = [];
    const taskStartDate = updatedTask.start_date || updatedTask.due_date;
    const taskEndDate = updatedTask.due_date || updatedTask.start_date;
    if (taskStartDate && taskEndDate) {
      taskScheduleItems.push({ id: `task-${updatedTask.id}`, date: taskEndDate, startDate: taskStartDate, endDate: taskEndDate, type: "업무일정", title: taskTitle, status: updatedTask.status, assignee: updatedTask.assignee || "미지정", projectName, assemblyVendorName: getTaskAssemblyVendorName(updatedTask), taskType: updatedTask.task_type, href: `/projects/${updatedTask.project_id}`, memo: items.find((item) => item.id === `task-${updatedTask.id}`)?.memo ?? null });
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === updatedTask.id ? updatedTask : task
      )
    );
    setItems((currentItems) =>
      [
        ...currentItems.filter(
          (item) => item.id !== `task-${updatedTask.id}`
          ),
        ...taskScheduleItems,
      ].sort((a, b) => a.date.localeCompare(b.date))
    );
  }

  async function handleCalendarTaskDetailUpdated(updatedTask: Task) {
    handleGanttTaskUpdated(updatedTask);
    const orderResult = await persistRecalculatedTaskOrders(
      tasks.map((task) => task.id === updatedTask.id ? updatedTask : task)
    );
    if (orderResult.error) {
      window.alert(`업무 순서를 저장하지 못했습니다.\n${orderResult.error.message}`);
      return;
    }
    setTasks(orderResult.data);
  }

  const groupedItems = (() => {
    const grouped: Record<string, CalendarItem[]> = {};

    filteredItems.forEach((item) => {
      if (!grouped[item.date]) {
        grouped[item.date] = [];
      }

      grouped[item.date].push(item);
    });

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  })();

  function formatKoreanDate(date: string) {
    const [year, month, day] = date.split("-");
    return `${year}년 ${Number(month)}월 ${Number(day)}일`;
  }

  const calendarDays = getCalendarDays();
  const showCompanySchedule = sourceFilter === "all" || sourceFilter === "company";
  const showPersonalSchedule = sourceFilter !== "company";
  const visibleCompanyCount = showCompanySchedule ? currentViewItems.length : 0;
  const displayedPersonalNotes = useMemo(() => personalNotes.filter((note) => matchesCalendarSourceFilter(note, sourceFilter) && matchesCompletedPersonalScheduleFilter(note, showCompletedPersonalSchedules)), [personalNotes, showCompletedPersonalSchedules, sourceFilter]);
  const visiblePersonalCount = showPersonalSchedule ? displayedPersonalNotes.length : 0;
  const calendarWeekLayouts = buildWeekSegments(
    showCompanySchedule ? calendarVisibleItems : [],
    splitMonthIntoWeeks(calendarDays)
  );
  const selectedDateTaskItems = (showCompanySchedule ? calendarVisibleItems : [])
    .filter((item) =>
      isTaskCalendarItem(item) &&
      (item.startDate && item.endDate
        ? item.startDate <= selectedDate && item.endDate >= selectedDate
        : item.date === selectedDate)
    )
    .sort((a, b) => {
      const priorityDiff =
        getCalendarItemPriority(a) - getCalendarItemPriority(b);

      if (priorityDiff !== 0) return priorityDiff;

      return a.title.localeCompare(b.title);
    });
  const personalNotesByDate = useMemo(() => {
    const grouped = new Map<string, PersonalNote[]>();
    for (const note of displayedPersonalNotes) {
      if (!note.due_date) continue;
      grouped.set(note.due_date, [...(grouped.get(note.due_date) ?? []), note]);
    }
    return grouped;
  }, [displayedPersonalNotes]);
  const selectedDatePersonalNotes = [...(personalNotesByDate.get(selectedDate) ?? [])].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || Number(a.is_completed) - Number(b.is_completed) || b.created_at.localeCompare(a.created_at));
  const selectedPersonalNote = selectedPersonalNoteId ? personalNotes.find((note) => note.id === selectedPersonalNoteId) ?? null : null;
  const personalNoteIdsKey = personalNotes.map((note) => note.id).join(",");

  useEffect(() => {
    if (!showCompletedPersonalSchedules && selectedPersonalNote?.is_completed) {
      const timer = window.setTimeout(() => setSelectedPersonalNoteId(null), 0);
      return () => window.clearTimeout(timer);
    }
  }, [selectedPersonalNote, showCompletedPersonalSchedules]);

  useEffect(() => {
    if (personalNoteDeepLinkHandledRef.current) return;
    const linkedId = new URLSearchParams(window.location.search).get("personalNote");
    if (linkedId && personalNotes.some((note) => note.id === linkedId)) {
      personalNoteDeepLinkHandledRef.current = true;
      const timer = window.setTimeout(() => setSelectedPersonalNoteId(linkedId), 0);
      return () => window.clearTimeout(timer);
    }
  }, [personalNotes]);

  useEffect(() => {
    function handleDelta(event: Event) {
      const detail = (event as CustomEvent<{ itemId: string; delta: number }>).detail;
      if (!detail) return;
      setPersonalNotes((current) => current.map((note) => note.id === detail.itemId ? { ...note, comment_count: Math.max(0, (note.comment_count ?? 0) + detail.delta) } : note));
    }
    function handleUnreadCleared(event: Event) {
      const itemId = (event as CustomEvent<{ itemId: string }>).detail?.itemId;
      if (itemId) setPersonalNotes((current) => current.map((note) => note.id === itemId ? { ...note, unread_comment_count: 0 } : note));
    }
    async function refreshCounts() {
      try {
        const counts = await loadCommentCounts(personalNoteIdsKey ? personalNoteIdsKey.split(",") : []);
        setPersonalNotes((current) => applyCommentCounts(current, counts));
      } catch { /* 다음 Realtime 이벤트 또는 일반 데이터 갱신에서 재시도합니다. */ }
    }
    window.addEventListener(COMMENT_COUNT_DELTA_EVENT, handleDelta);
    window.addEventListener(COMMENT_COUNTS_INVALIDATED_EVENT, refreshCounts);
    window.addEventListener(COMMENT_UNREAD_CLEARED_EVENT, handleUnreadCleared);
    return () => {
      window.removeEventListener(COMMENT_COUNT_DELTA_EVENT, handleDelta);
      window.removeEventListener(COMMENT_COUNTS_INVALIDATED_EVENT, refreshCounts);
      window.removeEventListener(COMMENT_UNREAD_CLEARED_EVENT, handleUnreadCleared);
    };
  }, [personalNoteIdsKey]);

  async function movePersonalNote(note: PersonalNote, dueDate: string) {
    if (!note.due_date || note.due_date === dueDate || note.sharing?.permission === "view") return;
    if (note.sharing && note.sharing.permission !== "owner" && !window.confirm(`공유 일정을 변경하시겠습니까?\n\n기존 일정: ${note.due_date}\n변경 일정: ${dueDate}\n\n참여자에게 동일하게 반영됩니다.`)) return;
    const previous = personalNotes;
    setPersonalNotes((current) => current.map((item) => item.id === note.id ? { ...item, due_date: dueDate } : item));
    try {
      await withShortEditingLock("personal_note", note.id, async () => {
        const response = await fetch(`/api/personal-notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueDate }) });
        if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? "일정 날짜를 변경하지 못했습니다."); }
      });
    } catch (error) { setPersonalNotes(previous); toast.error(error instanceof Error ? error.message : "일정 날짜를 변경하지 못했습니다."); return; }
    dispatchPersonalNotesChanged();
    toast.success("일정 날짜를 변경했습니다.");
  }
  async function patchPersonalNote(note: PersonalNote, changes: Record<string, unknown>) {
    const previous = personalNotes;
    setPersonalNotes((current) => current.map((item) => item.id === note.id ? {
      ...item,
      is_completed: typeof changes.isCompleted === "boolean" ? changes.isCompleted : item.is_completed,
      is_pinned: typeof changes.isPinned === "boolean" ? changes.isPinned : item.is_pinned,
    } : item));
    try {
      await withShortEditingLock("personal_note", note.id, async () => {
        const response = await fetch(`/api/personal-notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
        if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? "변경사항을 저장하지 못했습니다."); }
      });
    } catch (error) { setPersonalNotes(previous); toast.error(error instanceof Error ? error.message : "변경사항을 저장하지 못했습니다."); return; }
    dispatchPersonalNotesChanged();
  }
  async function deletePersonalNote(note: PersonalNote) {
    if (!window.confirm("이 일정을 삭제하시겠습니까?")) return;
    const previous = personalNotes;
    setPersonalNotes((current) => current.filter((item) => item.id !== note.id));
    const response = await fetch(`/api/personal-notes/${note.id}`, { method: "DELETE" });
    if (!response.ok) { setPersonalNotes(previous); toast.error("일정을 삭제하지 못했습니다."); return; }
    setSelectedPersonalNoteId(null);
    dispatchPersonalNotesChanged(); toast.success("일정을 삭제했습니다.");
  }
  const legendItems: { label: string; variant: BadgeVariant }[] = [
    { label: "지연", variant: "danger" },
    { label: "오늘", variant: "warning" },
    { label: "이번 주", variant: "info" },
    { label: "완료", variant: "success" },
  ];
  const hasActiveFilter =
    quickFilter !== "전체" ||
    typeFilter !== "전체" ||
    assigneeFilter !== "전체";

  return (
    <div onDragStartCapture={(event) => { if (calendarReadOnly) event.preventDefault(); }} className="min-h-screen min-w-0 max-w-full bg-slate-50 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
            <CalendarDays size={16} />
            Calendar {calendarReadOnly && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">읽기 전용</span>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Calendar
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            프로젝트 업무를 한눈에 관리하세요.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Workspace Filter
          </div>
          <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
            {quickFilters.map((filter) => (
              <Button
                key={filter}
                onClick={() => setQuickFilter(filter)}
                variant={quickFilter === filter ? "primary" : "ghost"}
                size="sm"
                className={`h-9 rounded-2xl px-3.5 text-sm font-medium transition-colors duration-150 ${
                  quickFilter === filter
                    ? "shadow-sm ring-1 ring-blue-100"
                    : "border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-100"
                }`}
              >
                {filter}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">{!calendarReadOnly && <Button onClick={() => openNoteEditor({ noteType: "todo", dueDate: selectedDate || today })} variant="primary" className="flex h-10 items-center gap-2 rounded-2xl px-4"><Plus size={16}/>내 일정 추가</Button>}<Button onClick={loadCalendar} variant="secondary" className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium transition-colors duration-150"><RefreshCw size={16}/>새로고침</Button></div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">조회 일정</h3>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{visibleCompanyCount + visiblePersonalCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">업무 일정</h3>
          <p className="mt-1 text-3xl font-bold tracking-tight text-blue-600">
            {showCompanySchedule ? currentViewItems.filter(isTaskCalendarItem).length : 0}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">오늘 일정</h3>
          <p className="mt-1 text-3xl font-bold tracking-tight text-orange-600">
            {(showCompanySchedule ? currentViewItems.filter((item) => item.date === today).length : 0) + (showPersonalSchedule ? displayedPersonalNotes.filter((note) => note.due_date === today).length : 0)}
          </p>
        </div>
      </div>

      <div className="mb-5 min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex w-full min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
          <div className="min-w-0 max-w-full"><div className="mb-1.5 text-xs font-medium text-slate-500">일정 소스</div><div className="flex max-w-full flex-wrap rounded-2xl bg-slate-100 p-1">{sourceFilters.map((filter) => <button key={filter.value} type="button" onClick={() => { setSourceFilter(filter.value); if (filter.value !== "all" && filter.value !== "company") setViewMode("달력 보기"); window.localStorage.setItem(CALENDAR_SOURCE_FILTER_KEY, filter.value); }} className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${sourceFilter === filter.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{filter.label}</button>)}</div></div>
          <div className="shrink-0"><div className="mb-1.5 text-xs font-medium text-slate-500">개인 일정</div><button type="button" role="switch" aria-checked={showCompletedPersonalSchedules} onClick={() => setShowCompletedPersonalSchedules((current) => { const next = !current; if (calendarPreferenceKey) window.localStorage.setItem(calendarPreferenceKey, String(next)); return next; })} className="inline-flex h-10 min-w-[104px] shrink-0 items-center justify-start gap-2 whitespace-nowrap rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 hover:bg-white focus-visible:ring-2 focus-visible:ring-violet-200 sm:min-w-[124px] lg:min-w-[140px]"><span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${showCompletedPersonalSchedules ? "bg-violet-600" : "bg-slate-300"}`} aria-hidden="true"><span className={`h-4 w-4 shrink-0 rounded-full bg-white shadow-sm transition-transform ${showCompletedPersonalSchedules ? "translate-x-4" : "translate-x-0"}`}/></span><span className="shrink-0 whitespace-nowrap"><span className="sm:hidden">완료 일정</span><span className="hidden sm:inline">완료 일정 표시</span></span></button></div>
          <div className="min-w-0 max-w-full">
            <div className="mb-1.5 text-xs font-medium text-slate-500">보기 방식</div>

            <div className="flex max-w-full flex-wrap gap-2">
              {viewList.map((view) => (
                <Button
                  key={view}
                  onClick={() => changeViewMode(view)}
                  variant={viewMode === view ? "primary" : "ghost"}
                  className={`h-10 shrink-0 whitespace-nowrap rounded-2xl px-4 text-sm font-medium transition-colors duration-150 ${
                    viewMode === view
                      ? "shadow-sm ring-1 ring-blue-100"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-100"
                  }`}
                >
                  {view}
                </Button>
              ))}
            </div>
          </div>

          <div className="shrink-0">
            <div className="mb-1.5 text-xs font-medium text-slate-500">일정 구분</div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 w-32 max-w-full shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors duration-150 hover:bg-white focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              {typeList.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="shrink-0">
            <div className="mb-1.5 text-xs font-medium text-slate-500">담당자</div>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-10 w-40 max-w-full shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors duration-150 hover:bg-white focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              {assigneeList.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
          </div>

          {viewMode === "달력 보기" && <div className="shrink-0">
            <div className="mb-1.5 text-xs font-medium text-slate-500">완료</div>
            <Button
              onClick={() => setShowCompleted((current) => !current)}
              variant={showCompleted ? "secondary" : "primary"}
              className="h-10 shrink-0 whitespace-nowrap rounded-2xl px-4 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-100"
            >
              {showCompleted ? "완료 숨기기" : "완료 보기"}
            </Button>
          </div>}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-5 ${viewMode === "간트 보기" ? "" : "xl:grid-cols-[minmax(0,1fr)_400px]"}`}>
        <div className="min-w-0">
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          불러오는 중...
        </div>
      ) : viewMode === "달력 보기" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Button
              onClick={() => moveMonth("prev")}
              variant="secondary"
              className="flex h-10 items-center gap-2 rounded-2xl px-4 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-100"
            >
              <ChevronLeft size={16} />
              이전달
            </Button>

            <div className="flex flex-wrap items-end justify-center gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-400">기준 월</span>
                <input
                  type="month"
                  value={currentMonth}
                  onChange={(event) => selectMonth(event.target.value)}
                  aria-label="기준 월 선택"
                  className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center text-sm font-semibold text-slate-950 outline-none transition-colors duration-150 hover:bg-white focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <span className="hidden h-10 items-center rounded-2xl bg-slate-100 px-3 text-sm font-medium text-slate-600 sm:inline-flex">
                {formatMonthLabel(currentMonth)}
              </span>
              <Button
                onClick={goToday}
                variant="ghost"
                className="h-10 rounded-2xl border border-transparent px-3 text-sm transition-colors duration-150 hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-100"
              >
                Today
              </Button>
            </div>

            <Button
              onClick={() => moveMonth("next")}
              variant="secondary"
              className="flex h-10 items-center gap-2 rounded-2xl px-4 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-100"
            >
              다음달
              <ChevronRight size={16} />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {["일", "월", "화", "수", "목", "금", "토"].map((day, dayIndex) => (
              <div
                key={day}
                className={`rounded-xl border px-2 py-2 text-center text-xs font-semibold ${dayIndex === 0 ? "border-red-100 bg-red-50 text-red-600" : dayIndex === 6 ? "border-blue-100 bg-blue-50 text-blue-600" : "border-slate-200 bg-slate-50 text-slate-500"}`}
              >
                {day}
              </div>
            ))}

            <div className="col-span-7 space-y-1.5 sm:space-y-2">
              {calendarWeekLayouts.map((week) => {
                const maxPersonalNoteCount = showPersonalSchedule ? Math.max(0, ...week.days.map((date) => date ? personalNotesByDate.get(date)?.length ?? 0 : 0)) : 0;
                const weekLayout = getMonthWeekLayout({ companyLaneCount: week.laneCount, personalItemCount: maxPersonalNoteCount, showCompany: showCompanySchedule, showPersonalCards: showPersonalSchedule });

                return (
                  <div
                    key={`week-${week.days.join("-")}`}
                    className="relative"
                    style={{ height: weekLayout.requiredWeekHeight }}
                  >
                    <div className="grid h-full grid-cols-7 gap-1.5 sm:gap-2">
                      {week.days.map((date, dayIndex) => {
                        const isSunday = dayIndex === 0;
                        const isSaturday = dayIndex === 6;
                        const weekendCellClass = isSunday ? "border-red-100 bg-red-50/40 hover:bg-red-50/60" : isSaturday ? "border-blue-100 bg-blue-50/40 hover:bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";
                        const dateNumberClass = date === selectedDate ? "text-blue-900" : date === today ? "text-amber-900" : isSunday ? "text-red-600" : isSaturday ? "text-blue-600" : "text-slate-700";
                        return <div
                          key={date || `empty-${dayIndex}`}
                          onClick={() => {
                            if (date) setSelectedDate(date);
                          }}
                          role={date ? "button" : undefined}
                          tabIndex={date ? 0 : undefined}
                          onKeyDown={(event) => {
                            if (!date) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedDate(date);
                            }
                          }}
                          onDragOver={(event) => { if (!calendarReadOnly && date && event.dataTransfer.types.includes("application/x-personal-note")) event.preventDefault(); }}
                          onDrop={(event) => { if (calendarReadOnly || !date) return; const noteId = event.dataTransfer.getData("application/x-personal-note"); const note = personalNotes.find((item) => item.id === noteId); if (note) { event.preventDefault(); void movePersonalNote(note, date); } }}
                          style={{ "--calendar-personal-top": `${weekLayout.personalAreaTop}px` } as CSSProperties}
                          className={`relative h-full rounded-2xl border p-2.5 outline-none transition-all duration-150 [&>div.mt-9]:absolute [&>div.mt-9]:inset-x-2 [&>div.mt-9]:top-[var(--calendar-personal-top)] [&>div.mt-9]:mt-0 ${showCompanySchedule ? "[&>button.top-10]:hidden" : ""} ${
                            date === selectedDate
                              ? "border-blue-200 bg-blue-50 shadow-sm ring-2 ring-blue-100"
                              : date === today
                                ? "border-amber-200 bg-amber-50"
                                : `${weekendCellClass} hover:shadow-sm`
                          } ${date ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-100" : isSunday ? "border-red-100 bg-red-50/25" : isSaturday ? "border-blue-100 bg-blue-50/25" : "border-slate-100 bg-slate-50/60"}`}
                        >
                          {date && (
                            <div className={`flex items-center justify-between gap-2 text-sm font-semibold ${dateNumberClass}`}>
                              <span>{Number(date.slice(-2))}</span>
                              {date === today && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                  오늘
                                </span>
                              )}
                            </div>
                          )}
                          {date && showPersonalSchedule && (personalNotesByDate.get(date)?.length ?? 0) > 0 && <button type="button" aria-label={`${date} 내 일정 보기`} onClick={(event) => { event.stopPropagation(); setSelectedDate(date); }} className="absolute right-2 top-10 z-20 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">📝 {personalNotesByDate.get(date)?.length}{(personalNotesByDate.get(date) ?? []).some((note) => note.sharing && note.sharing.permission !== "owner") ? " · 👥" : ""}</button>}
                          {date && showPersonalSchedule && <div className="mt-9 space-y-1">{(personalNotesByDate.get(date) ?? []).map((note) => { const isSharedWithMe = Boolean(note.sharing && note.sharing.permission !== "owner"); const isSharedByMe = note.sharing?.permission === "owner" && note.sharing.memberCount > 0; const authorName = note.sharing?.ownerName ?? currentAssignee ?? "-"; const commentBadge = getPersonalNoteCommentBadge(note); return <div key={note.id} draggable={note.sharing?.permission !== "view"} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("application/x-personal-note", note.id); event.dataTransfer.effectAllowed = "move"; }} className={`h-16 rounded-md border px-1.5 py-1 text-[10px] transition ${note.is_completed ? COMPLETED_PERSONAL_SCHEDULE_STYLES.card : "border-slate-200 bg-white text-slate-600"} ${note.sharing?.permission === "view" ? "cursor-default" : "cursor-grab"}`}><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedPersonalNoteId(note.id); }} className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-200"><p className={`truncate font-semibold ${note.is_completed ? COMPLETED_PERSONAL_SCHEDULE_STYLES.title : "text-slate-700"}`}>{note.title || note.content}</p><p className={`truncate text-[9px] ${note.is_completed ? COMPLETED_PERSONAL_SCHEDULE_STYLES.meta : "text-slate-400"}`}>{note.due_date} · 👤 {authorName}</p><div className="mt-0.5 flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">{note.is_completed && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700"><Check size={9}/>완료</span>}{commentBadge && <span className="shrink-0 text-[9px] text-slate-500">💬 {commentBadge}</span>}{isSharedByMe && <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">공유중</span>}{isSharedWithMe && <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">공유받음</span>}</div></button></div>; })}</div>}
                         </div>;
                      })}
                    </div>

                    <div className="pointer-events-none absolute inset-x-0 top-11 z-10 grid grid-cols-7 gap-x-1.5 gap-y-1.5 sm:gap-x-2">
                      {week.segments.map((segment) => {
                        const { item } = segment;
                        const roundedClass = `${
                          segment.isRangeStart ? "rounded-l-lg" : "rounded-l-none"
                        } ${segment.isRangeEnd ? "rounded-r-lg" : "rounded-r-none"}`;
                        const positionStyle = {
                          gridColumn: `${segment.startColumn} / span ${segment.span}`,
                          gridRow: segment.laneIndex + 1,
                        };

                        return (
                          <button
                            type="button"
                            key={`${item.id}-week-${segment.weekIndex}`}
                            title={`${item.title} · ${item.projectName ?? "-"} · ${item.taskStartDate ?? getItemRange(item).start} ~ ${item.taskEndDate ?? getItemRange(item).end}${item.memo ? `\n${item.memo.isImportant ? "중요 메모" : "메모"}: ${item.memo.note}${item.memo.checkDate ? `\n확인일: ${item.memo.checkDate}` : ""}` : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openTaskDetailModal(item);
                            }}
                            className={`pointer-events-auto h-[29px] min-w-0 truncate border px-2 text-left text-[13px] font-semibold leading-4 shadow-sm transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${roundedClass} ${getTaskDueClassName(
                              item
                            )}`}
                            style={positionStyle}
                          >
                            <span className="flex min-w-0 items-center gap-1"><span className="min-w-0 flex-1 truncate">{item.title}</span>{item.memo && <span className="shrink-0" aria-label={item.memo.isImportant ? "중요 메모 있음" : "메모 있음"}>{item.memo.isImportant ? "⚠" : "📝"}</span>}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : viewMode === "간트 보기" ? (
        <IntegratedProjectGantt
          projects={projects}
          tasks={tasks}
          visibleTaskIds={ganttTaskIds}
          currentMonth={currentMonth}
          today={today}
          onCurrentMonthChange={selectMonth}
          onTaskUpdated={handleGanttTaskUpdated}
          canEdit={calendarPermissions.canEditCalendar}
          canExport={calendarPermissions.canExportCalendar}
          showCompletedProjects={showCompletedProjects}
          onShowCompletedProjectsChange={setShowCompletedProjects}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-bold tracking-tight text-slate-950">타임라인</h2>

          {groupedItems.length === 0 ? (
            <EmptyState
              message="조회된 일정이 없습니다."
              className="rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-500"
            />
          ) : (
            <div className="relative ml-4 space-y-7 border-l border-slate-200">
              {groupedItems.map(([date, dateItems]) => (
                <div key={date} className="relative pl-8">
                  <div className="absolute -left-[7px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />

                  <div className="mb-3">
                    <span className="text-base font-bold text-slate-950">{date}</span>
                    {date === today && (
                      <span className="ml-2 text-sm font-bold text-orange-600">
                        오늘
                      </span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {dateItems.map((item) => {
                      const itemContent = (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <span
                                className={`mr-3 inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${getTypeStyle(
                                  item.type
                                )}`}
                              >
                                {getDisplayType(item.type)}
                              </span>
                              <span className="font-medium leading-6 text-slate-900">{item.title}</span>{item.memo && <span className="ml-2 shrink-0" aria-label={item.memo.isImportant ? "중요 메모 있음" : "메모 있음"} title={item.memo.note}>{item.memo.isImportant ? "⚠" : "📝"}</span>}
                            </div>

                            <div className="shrink-0 text-sm text-slate-500">
                              담당자: {item.assignee}
                            </div>
                          </div>

                          <div className="mt-2 text-sm leading-6 text-slate-500">
                            상태: {item.status || "-"}
                            {item.projectName ? ` · ${item.projectName}` : ""}
                          </div>
                        </>
                      );

                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => openTaskDetailModal(item)}
                          className="block w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors duration-150 hover:border-slate-300 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                        >
                          {itemContent}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </div>

        <aside className={`min-w-0 overflow-x-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${viewMode === "간트 보기" ? "hidden" : ""}`}>
          <div className="mb-5 border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              {formatKoreanDate(selectedDate)}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">{showCompanySchedule && `회사 일정 ${selectedDateTaskItems.length}건`}{showCompanySchedule && showPersonalSchedule ? " · " : ""}{showPersonalSchedule && `내 일정 ${selectedDatePersonalNotes.length}건`}</p>
          </div>

          {showCompanySchedule && <div className="mb-5 min-w-0 rounded-2xl bg-slate-50 p-3.5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">선택 날짜 업무</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                {selectedDateTaskItems.length}건
              </span>
            </div>

            {selectedDateTaskItems.length > 0 ? (
              <div className="max-h-[520px] min-w-0 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                {selectedDateTaskItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => openTaskDetailModal(item)}
                    className="block w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 text-left text-sm transition-colors duration-150 hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                  >
                    <div className="whitespace-normal break-words text-sm font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">
                      {item.title}
                    </div>
                    <div className="mt-1.5 whitespace-normal break-words text-sm font-medium leading-5 text-slate-600 [overflow-wrap:anywhere]">
                      {item.projectName || "-"}
                    </div>
                    <div className="mt-1.5 whitespace-normal break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">
                      담당자 {item.assignee}
                      <span className="mx-1 text-slate-300">|</span>
                      <span className="font-semibold text-blue-600">
                        조립업체 {item.assemblyVendorName || "미지정"}
                      </span>
                    </div>
                    <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1">
                      <span className="max-w-full whitespace-normal break-words rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium leading-5 text-slate-500 [overflow-wrap:anywhere]">
                        {item.taskType || getDisplayType(item.type)}
                      </span>
                      <Badge
                        variant={getTaskStatusVariant(item.status)}
                        className="px-2 py-0.5 text-[11px] font-medium"
                      >
                        {getTaskStatusLabel(item.status)}
                      </Badge>
                      {isTaskCompleted(item.status) ? (
                        <Badge variant="success" className="px-2 py-0.5 text-[11px] font-medium">{getTaskDueLabel(item)}</Badge>
                      ) : (
                        <DdayBadge targetDate={item.date} today={today} className="px-2 py-0.5 text-[11px]" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                message={
                  hasActiveFilter
                    ? "조건에 맞는 업무가 없습니다."
                    : "선택한 날짜에 등록된 업무가 없습니다."
                }
                className="rounded-xl bg-white p-8 text-center text-sm text-slate-400"
              />
            )}
          </div>}

          {showPersonalSchedule && <div className="mb-5 min-w-0 rounded-2xl bg-violet-50 p-3.5">
            <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">내 일정</h3><p className="mt-0.5 text-xs text-slate-500">직접 만든 일정과 수락한 공유 일정</p></div>{!calendarReadOnly && <button type="button" onClick={() => openNoteEditor({ noteType: "todo", dueDate: selectedDate })} className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700"><Plus size={14}/>내 일정 추가</button>}</div>
            {selectedDatePersonalNotes.length > 0 ? <div className="max-h-80 space-y-2 overflow-y-auto pr-1">{selectedDatePersonalNotes.map((note) => { const isSharedWithMe = Boolean(note.sharing && note.sharing.permission !== "owner"); const isSharedByMe = note.sharing?.permission === "owner" && note.sharing.memberCount > 0; const authorName = note.sharing?.ownerName ?? currentAssignee ?? "-"; const commentBadge = getPersonalNoteCommentBadge(note); return <article key={note.id} className={`rounded-xl border p-3 transition ${note.is_completed ? COMPLETED_PERSONAL_SCHEDULE_STYLES.card : "border-slate-200 bg-white"}`}><div className="flex items-start gap-2"><button type="button" onClick={() => setSelectedPersonalNoteId(note.id)} className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-200"><p className={`truncate text-sm font-semibold ${note.is_completed ? COMPLETED_PERSONAL_SCHEDULE_STYLES.title : "text-slate-800"}`}>{note.title || note.content}</p><div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] ${note.is_completed ? COMPLETED_PERSONAL_SCHEDULE_STYLES.meta : "text-slate-400"}`}><span>{note.due_date ?? "날짜 없음"}</span><span>작성자 {authorName}</span>{note.is_completed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700"><Check size={10}/>완료</span>}{commentBadge && <span>💬 {commentBadge}</span>}{isSharedByMe && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-700">공유중</span>}{isSharedWithMe && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">공유받음</span>}</div></button><PersonalNoteActions note={note} commentsOpen={false} timelineOpen={false} onEdit={() => openNoteEditor({ note })} onShare={() => setShareTarget(note)} onTogglePin={() => void patchPersonalNote(note, { isPinned: !note.is_pinned })} onDelete={() => void deletePersonalNote(note)} onToggleComments={() => setSelectedPersonalNoteId(note.id)} onToggleTimeline={() => setSelectedPersonalNoteId(note.id)}/></div></article>; })}</div> : <EmptyState message="선택한 날짜에 개인 일정이 없습니다." className="rounded-xl bg-white p-6 text-center text-sm text-slate-400"/>}
          </div>}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Legend</h3>
            <div className="flex flex-wrap gap-2">
              {legendItems.map((item) => (
                <Badge key={item.label} variant={item.variant}>
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {selectedTask && (
        <GanttTaskDetailModal
          task={selectedTask}
          today={today}
          onTaskUpdated={(updatedTask) => void handleCalendarTaskDetailUpdated(updatedTask)}
          canEdit={calendarPermissions.canEditCalendar}
          showCalendarTaskNotes
          onClose={() => setSelectedTask(null)}
        />
      )}

      {selectedPersonalNote && (
        <PersonalNoteDetailModal
          note={selectedPersonalNote}
          authorName={selectedPersonalNote.sharing?.ownerName ?? currentAssignee ?? "-"}
          onClose={() => setSelectedPersonalNoteId(null)}
          onEdit={() => { setSelectedPersonalNoteId(null); openNoteEditor({ note: selectedPersonalNote }); }}
          onShare={() => { setSelectedPersonalNoteId(null); setShareTarget(selectedPersonalNote); }}
          onTogglePin={() => void patchPersonalNote(selectedPersonalNote, { isPinned: !selectedPersonalNote.is_pinned })}
          onToggleCompleted={() => void patchPersonalNote(selectedPersonalNote, { isCompleted: !selectedPersonalNote.is_completed })}
          onDelete={() => void deletePersonalNote(selectedPersonalNote)}
        />
      )}

      {shareTarget && (
        <ShareDialog note={shareTarget} onClose={() => setShareTarget(null)} onChanged={() => { dispatchPersonalNotesChanged(); setShareTarget(null); }}/>
      )}

    </div>
  );
}
