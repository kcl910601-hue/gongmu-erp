import { supabase } from "@/lib/supabase";

const RECENT_PROJECTS_KEY = "gongmu-recent-projects";
const RECENT_TASKS_KEY = "gongmu-recent-tasks";
const FAVORITE_PROJECTS_KEY = "gongmu-favorite-projects";
const MAX_RECENT_PROJECTS = 10;
const MAX_RECENT_TASKS = 15;
const MAX_FAVORITE_PROJECTS = 20;

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
  notifyRecentUpdated();

  return true;
}

export function clearFavoriteProjects(userScope: string | null) {
  if (!userScope) return false;

  writeStorageList(getFavoriteProjectsStorageKey(userScope), []);
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
