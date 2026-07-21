import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  createIlikeFilter,
  GLOBAL_SEARCH_MIN_LENGTH,
  GLOBAL_SEARCH_RESULT_LIMIT,
  normalizeSearchQuery,
  sanitizePostgrestSearchValue,
} from "@/lib/search";
import type {
  GlobalSearchResponse,
  ProjectSearchResult,
  ShipmentSearchResult,
  TaskSearchResult,
} from "@/types/search";

type ProjectRow = {
  id: number;
  project_code: string | null;
  project_name: string;
  process_type: string;
  task_manager: string | null;
  status: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = normalizeSearchQuery(url.searchParams.get("q") ?? "");
  const safeQuery = sanitizePostgrestSearchValue(rawQuery);

  const emptyResponse: GlobalSearchResponse = {
    projects: [],
    tasks: [],
    shipments: [],
    employees: [],
  };

  if (safeQuery.length < GLOBAL_SEARCH_MIN_LENGTH) {
    return Response.json(emptyResponse);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let { data: employee } = await supabase
    .from("employees")
    .select("id, role, active, approval_status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!employee && user.email) {
    const fallback = await supabase
      .from("employees")
      .select("id, role, active, approval_status")
      .eq("email", user.email)
      .maybeSingle();
    employee = fallback.data;
  }

  if (
    !employee ||
    employee.approval_status !== "approved" ||
    employee.active === false
  ) {
    return Response.json({ error: "검색 권한이 없습니다." }, { status: 403 });
  }

  const projectFilter = createIlikeFilter(safeQuery, [
    "project_code",
    "project_name",
    "client_name",
    "site_address",
    "salesperson",
    "process_type",
    "task_manager",
  ]);
  const taskFilter = createIlikeFilter(safeQuery, [
    "task_name",
    "task_type",
    "assignee",
    "status",
  ]);
  const shipmentFilter = createIlikeFilter(safeQuery, [
    "site_name",
    "item_name",
    "status",
    "driver_name",
    "destination",
    "receiver",
    "memo",
  ]);

  const [projectResult, taskResult, shipmentResult, employeeResult] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, project_code, project_name, process_type, task_manager, status"
        )
        .or(projectFilter)
        .limit(GLOBAL_SEARCH_RESULT_LIMIT),
      supabase
        .from("tasks")
        .select(
          "id, project_id, task_name, task_type, assignee, due_date, status"
        )
        .or(taskFilter)
        .limit(GLOBAL_SEARCH_RESULT_LIMIT),
      supabase
        .from("shipments")
        .select(
          "id, project_id, site_name, item_name, shipment_date, status, driver_name"
        )
        .or(shipmentFilter)
        .limit(GLOBAL_SEARCH_RESULT_LIMIT),
      employee.role === "admin"
        ? supabase
            .from("employees")
            .select("id, name, position, role, active")
            .or(
              createIlikeFilter(safeQuery, [
                "name",
                "email",
                "position",
                "role",
              ])
            )
            .limit(GLOBAL_SEARCH_RESULT_LIMIT)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const firstError =
    projectResult.error ||
    taskResult.error ||
    shipmentResult.error ||
    employeeResult.error;

  if (firstError) {
    console.error("global search failed", {
      path: url.pathname,
      query: rawQuery,
      error: firstError,
    });
    return Response.json(
      { error: "검색 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  const directProjects = (projectResult.data ?? []) as ProjectRow[];
  let directTasks = taskResult.data ?? [];
  let directShipments = shipmentResult.data ?? [];
  const matchedProjectIds = directProjects.map((project) => project.id);

  if (matchedProjectIds.length > 0) {
    const [projectTaskResult, projectShipmentResult] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, project_id, task_name, task_type, assignee, due_date, status"
        )
        .in("project_id", matchedProjectIds)
        .limit(GLOBAL_SEARCH_RESULT_LIMIT),
      supabase
        .from("shipments")
        .select(
          "id, project_id, site_name, item_name, shipment_date, status, driver_name"
        )
        .in("project_id", matchedProjectIds)
        .limit(GLOBAL_SEARCH_RESULT_LIMIT),
    ]);

    if (projectTaskResult.error || projectShipmentResult.error) {
      const error = projectTaskResult.error || projectShipmentResult.error;
      console.error("global search linked data failed", {
        path: url.pathname,
        query: rawQuery,
        error,
      });
      return Response.json(
        { error: "검색 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    directTasks = Array.from(
      new Map(
        [...directTasks, ...(projectTaskResult.data ?? [])].map((task) => [
          task.id,
          task,
        ])
      ).values()
    ).slice(0, GLOBAL_SEARCH_RESULT_LIMIT);
    directShipments = Array.from(
      new Map(
        [...directShipments, ...(projectShipmentResult.data ?? [])].map(
          (shipment) => [shipment.id, shipment]
        )
      ).values()
    ).slice(0, GLOBAL_SEARCH_RESULT_LIMIT);
  }
  const linkedProjectIds = Array.from(
    new Set([
      ...directTasks.map((task) => task.project_id),
      ...directShipments
        .map((shipment) => shipment.project_id)
        .filter((id): id is number => id !== null),
    ])
  );

  const linkedProjects =
    linkedProjectIds.length > 0
      ? await supabase
          .from("projects")
          .select("id, project_code, project_name, process_type, task_manager, status")
          .in("id", linkedProjectIds)
      : { data: [], error: null };

  if (linkedProjects.error) {
    console.error("global search project mapping failed", {
      path: url.pathname,
      query: rawQuery,
      error: linkedProjects.error,
    });
    return Response.json(
      { error: "검색 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  const projectMap = new Map(
    ((linkedProjects.data ?? []) as ProjectRow[]).map((project) => [
      project.id,
      project,
    ])
  );

  const projects: ProjectSearchResult[] = directProjects.map((project) => ({
    id: project.id,
    projectCode: project.project_code,
    projectName: project.project_name,
    processType: project.process_type,
    taskManager: project.task_manager,
    status: project.status,
  }));
  const tasks: TaskSearchResult[] = directTasks.map((task) => ({
    id: task.id,
    projectId: task.project_id,
    taskName: task.task_name,
    projectName:
      projectMap.get(task.project_id)?.project_name ??
      `프로젝트 #${task.project_id}`,
    assignee: task.assignee,
    dueDate: task.due_date,
    status: task.status,
  }));
  const shipments: ShipmentSearchResult[] = directShipments.map((shipment) => ({
    id: shipment.id,
    projectId: shipment.project_id,
    title: shipment.item_name || shipment.site_name || "출고",
    projectName:
      shipment.project_id !== null
        ? projectMap.get(shipment.project_id)?.project_name ?? null
        : null,
    shipmentDate: shipment.shipment_date,
    status: shipment.status,
    assignee: shipment.driver_name,
  }));

  return Response.json({
    projects,
    tasks,
    shipments,
    employees: employeeResult.data ?? [],
  } satisfies GlobalSearchResponse);
}
