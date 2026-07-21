import { supabase } from "@/lib/supabase";

const RECENT_PROJECTS_KEY = "gongmu-recent-projects";
const RECENT_TASKS_KEY = "gongmu-recent-tasks";
const FAVORITE_PROJECTS_KEY = "gongmu-favorite-projects";
const RECENT_WORKSPACE_KEY = "gongmu-recent-workspace";
const MAX_RECENT_PROJECTS = 10;
const MAX_RECENT_TASKS = 15;
const MAX_FAVORITE_PROJECTS = 10;
const MAX_RECENT_WORKSPACE = 15;

export type RecentWorkspaceItem = {
  key: string;
  type: "project" | "task" | "shipment" | "file";
  name: string;
  href: string;
  project_id: number | null;
  visited_at: string;
};

export type RecentProject = {
  project_id: number;
  project_name: string;
  project_code: string | null;
  assembly_vendor: string | null;
  status: string | null;
  visited_at: string;
};

export type RecentTask = {
  task_id: number;
  project_id: number;
  project_name: string;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  due_date: string | null;
  updated_at: string;
};

export type FavoriteProject = {
  project_id: number;
  project_name: string;
  project_code: string | null;
  assembly_vendor: string | null;
  status: string | null;
  favorited_at: string;
};

export type RecentProjectInput = Omit<RecentProject, "visited_at">;
export type RecentTaskInput = Omit<RecentTask, "updated_at">;
export type FavoriteProjectInput = Omit<FavoriteProject, "favorited_at">;

export async function getRecentUserScope() {
  if (typeof window === "undefined") return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user?.id || session?.user?.email || null;
}

export function getRecentProjectsStorageKey(userScope: string | null) {
  return userScope ? `${RECENT_PROJECTS_KEY}:${userScope}` : RECENT_PROJECTS_KEY;
}

export function getRecentTasksStorageKey(userScope: string | null) {
  return userScope ? `${RECENT_TASKS_KEY}:${userScope}` : RECENT_TASKS_KEY;
}

export function getFavoriteProjectsStorageKey(userScope: string) {
  return `${FAVORITE_PROJECTS_KEY}:${userScope}`;
}

export function getRecentWorkspaceStorageKey(userScope: string | null) {
  return userScope
    ? `${RECENT_WORKSPACE_KEY}:${userScope}`
    : RECENT_WORKSPACE_KEY;
}

export function readRecentWorkspace(userScope: string | null) {
  return readStorageList<RecentWorkspaceItem>(
    getRecentWorkspaceStorageKey(userScope)
  );
}

export async function recordRecentWorkspaceItem(
  item: Omit<RecentWorkspaceItem, "visited_at">
) {
  const userScope = await getRecentUserScope();
  const nextItem: RecentWorkspaceItem = {
    ...item,
    visited_at: new Date().toISOString(),
  };
  const nextItems = [
    nextItem,
    ...readRecentWorkspace(userScope).filter(
      (current) => current.key !== item.key
    ),
  ].slice(0, MAX_RECENT_WORKSPACE);

  writeStorageList(getRecentWorkspaceStorageKey(userScope), nextItems);
  notifyRecentUpdated();
}

export function removeRecentWorkspaceItem(
  userScope: string | null,
  itemKey: string
) {
  writeStorageList(
    getRecentWorkspaceStorageKey(userScope),
    readRecentWorkspace(userScope).filter((item) => item.key !== itemKey)
  );
  notifyRecentUpdated();
}

export function readRecentProjects(userScope: string | null) {
  return readStorageList<RecentProject>(getRecentProjectsStorageKey(userScope));
}

export function readRecentTasks(userScope: string | null) {
  return readStorageList<RecentTask>(getRecentTasksStorageKey(userScope));
}

export function readFavoriteProjects(userScope: string | null) {
  if (!userScope) return [];

  return readStorageList<FavoriteProject>(
    getFavoriteProjectsStorageKey(userScope)
  );
}

export async function hydrateFavoriteProjectsFromDatabase(
  userScope: string | null
) {
  if (!userScope) return [];

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user.id) return readFavoriteProjects(userScope);

  const { data: favoriteRows, error: favoriteError } = await supabase
    .from("user_favorite_projects")
    .select("project_id, created_at")
    .eq("auth_user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_FAVORITE_PROJECTS);

  if (favoriteError) {
    return readFavoriteProjects(userScope);
  }
  if (!favoriteRows?.length) {
    writeStorageList(getFavoriteProjectsStorageKey(userScope), []);
    return [];
  }

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, project_name, project_code, assembly_vendor, status")
    .in(
      "id",
      favoriteRows.map((row) => row.project_id)
    );

  if (projectsError || !projects) return readFavoriteProjects(userScope);

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const favorites = favoriteRows.flatMap<FavoriteProject>((row) => {
    const project = projectsById.get(row.project_id);
    if (!project) return [];

    return [{
      project_id: project.id,
      project_name: project.project_name,
      project_code: project.project_code,
      assembly_vendor: project.assembly_vendor,
      status: project.status,
      favorited_at: row.created_at,
    }];
  });

  writeStorageList(getFavoriteProjectsStorageKey(userScope), favorites);
  return favorites;
}

export function isFavoriteProject(userScope: string | null, projectId: number) {
  return readFavoriteProjects(userScope).some(
    (project) => project.project_id === projectId
  );
}

export async function recordRecentProject(project: RecentProjectInput) {
  const userScope = await getRecentUserScope();
  const nextProject: RecentProject = {
    ...project,
    visited_at: new Date().toISOString(),
  };
  const currentProjects = readRecentProjects(userScope);
  const nextProjects = [
    nextProject,
    ...currentProjects.filter(
      (item) => item.project_id !== nextProject.project_id
    ),
  ].slice(0, MAX_RECENT_PROJECTS);

  writeStorageList(getRecentProjectsStorageKey(userScope), nextProjects);
  await recordRecentWorkspaceItem({
    key: `project-${project.project_id}`,
    type: "project",
    name: project.project_name,
    href: `/projects/${project.project_id}`,
    project_id: project.project_id,
  });
  notifyRecentUpdated();
}

export async function recordRecentTask(task: RecentTaskInput) {
  const userScope = await getRecentUserScope();
  const nextTask: RecentTask = {
    ...task,
    updated_at: new Date().toISOString(),
  };
  const currentTasks = readRecentTasks(userScope);
  const nextTasks = [
    nextTask,
    ...currentTasks.filter((item) => item.task_id !== nextTask.task_id),
  ].slice(0, MAX_RECENT_TASKS);

  writeStorageList(getRecentTasksStorageKey(userScope), nextTasks);
  await recordRecentWorkspaceItem({
    key: `task-${task.task_id}`,
    type: "task",
    name: task.task_name || "업무",
    href: `/projects/${task.project_id}#project-tasks`,
    project_id: task.project_id,
  });
  notifyRecentUpdated();
}

export function removeRecentProject(userScope: string | null, projectId: number) {
  const nextProjects = readRecentProjects(userScope).filter(
    (project) => project.project_id !== projectId
  );

  writeStorageList(getRecentProjectsStorageKey(userScope), nextProjects);
  notifyRecentUpdated();
}

export function removeRecentTask(userScope: string | null, taskId: number) {
  const nextTasks = readRecentTasks(userScope).filter(
    (task) => task.task_id !== taskId
  );

  writeStorageList(getRecentTasksStorageKey(userScope), nextTasks);
  notifyRecentUpdated();
}

export function clearRecentProjects(userScope: string | null) {
  writeStorageList(getRecentProjectsStorageKey(userScope), []);
  notifyRecentUpdated();
}

export function clearRecentTasks(userScope: string | null) {
  writeStorageList(getRecentTasksStorageKey(userScope), []);
  notifyRecentUpdated();
}

export function addFavoriteProject(
  userScope: string | null,
  project: FavoriteProjectInput
) {
  if (!userScope) return false;

  const currentProjects = readFavoriteProjects(userScope);
  const existingProject = currentProjects.find(
    (item) => item.project_id === project.project_id
  );
  const nextProject: FavoriteProject = {
    ...project,
    favorited_at: existingProject?.favorited_at || new Date().toISOString(),
  };
  const nextProjects = [
    nextProject,
    ...currentProjects.filter(
      (item) => item.project_id !== nextProject.project_id
    ),
  ].slice(0, MAX_FAVORITE_PROJECTS);

  writeStorageList(getFavoriteProjectsStorageKey(userScope), nextProjects);
  void persistFavoriteProject(project.project_id);
  notifyRecentUpdated();

  return true;
}

export function removeFavoriteProject(
  userScope: string | null,
  projectId: number
) {
  if (!userScope) return false;

  const nextProjects = readFavoriteProjects(userScope).filter(
    (project) => project.project_id !== projectId
  );

  writeStorageList(getFavoriteProjectsStorageKey(userScope), nextProjects);
  void deletePersistedFavoriteProject(projectId);
  notifyRecentUpdated();

  return true;
}

export function clearFavoriteProjects(userScope: string | null) {
  if (!userScope) return false;

  writeStorageList(getFavoriteProjectsStorageKey(userScope), []);
  void clearPersistedFavoriteProjects();
  notifyRecentUpdated();

  return true;
}

function readStorageList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) return [];

    const parsedValue = JSON.parse(rawValue);

    return Array.isArray(parsedValue) ? (parsedValue as T[]) : [];
  } catch {
    return [];
  }
}

function writeStorageList<T>(key: string, items: T[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(key, JSON.stringify(items));
}

function notifyRecentUpdated() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event("gongmu-recent-updated"));
}

async function persistFavoriteProject(projectId: number) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user.id) return;

  const { error } = await supabase.from("user_favorite_projects").upsert(
    {
      auth_user_id: session.user.id,
      project_id: projectId,
    },
    { onConflict: "auth_user_id,project_id" }
  );
  if (error) return;

  const { data: overflow } = await supabase
    .from("user_favorite_projects")
    .select("project_id")
    .eq("auth_user_id", session.user.id)
    .order("created_at", { ascending: false })
    .range(MAX_FAVORITE_PROJECTS, MAX_FAVORITE_PROJECTS + 50);

  if (overflow?.length) {
    await supabase
      .from("user_favorite_projects")
      .delete()
      .eq("auth_user_id", session.user.id)
      .in(
        "project_id",
        overflow.map((favorite) => favorite.project_id)
      );
  }
}

async function deletePersistedFavoriteProject(projectId: number) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user.id) return;

  await supabase
    .from("user_favorite_projects")
    .delete()
    .eq("auth_user_id", session.user.id)
    .eq("project_id", projectId);
}

async function clearPersistedFavoriteProjects() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user.id) return;

  await supabase
    .from("user_favorite_projects")
    .delete()
    .eq("auth_user_id", session.user.id);
}
