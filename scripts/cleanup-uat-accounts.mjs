import { createClient } from "@supabase/supabase-js";

const APPROVED_PRODUCTION_REF = "cropibqvvzpxlnqpkyto";
const dryRun = process.argv.includes("--dry-run");
const emails = ["uat.admin@example.com", "uat.manager@example.com", "uat.staff@example.com", "uat.viewer@example.com", "uat.inactive@example.com", "uat.pending@example.com", "uat.rejected@example.com"];
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UAT_PROJECT_REF", "UAT_ENVIRONMENT"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) throw new Error(`UAT cleanup aborted: missing environment variables: ${missing.join(", ")}`);

const environment = process.env.UAT_ENVIRONMENT.toLowerCase();
const projectRef = process.env.UAT_PROJECT_REF;
const supabaseUrl = new URL(process.env.SUPABASE_URL);
if (environment === "production" && (process.env.ALLOW_PRODUCTION_UAT !== "true" || projectRef !== APPROVED_PRODUCTION_REF)) {
  throw new Error("UAT cleanup aborted: production UAT approval is missing.");
}
if (!dryRun && process.env.ALLOW_PRODUCTION_UAT_CLEANUP !== "true") throw new Error("UAT cleanup aborted: ALLOW_PRODUCTION_UAT_CLEANUP=true is required.");
if (!supabaseUrl.hostname.startsWith(`${projectRef}.`)) throw new Error("UAT cleanup aborted: SUPABASE_URL does not match UAT_PROJECT_REF.");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function selectIds(table, column, pattern) {
  const { data, error } = await supabase.from(table).select("id").like(column, pattern);
  if (error) throw error;
  return data.map((row) => row.id);
}

async function deleteByIds(table, column, ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from(table).delete().in(column, ids);
  if (error) throw error;
}

const authUsers = (await listAllAuthUsers()).filter((user) => emails.includes(user.email?.toLowerCase()));
const invalidAuth = authUsers.filter((user) => user.app_metadata?.uat_seed !== "sprint-6-4");
if (invalidAuth.length > 0) throw new Error("Cleanup aborted: a reserved email is not owned by the Sprint 6-4 seed.");
const authIds = authUsers.map((user) => user.id);
const { data: employees, error: employeeError } = await supabase.from("employees").select("id,email,auth_user_id").in("email", emails);
if (employeeError) throw employeeError;
if (employees.some((employee) => !authIds.includes(employee.auth_user_id))) throw new Error("Cleanup aborted: employee/Auth identity mismatch.");

const projectIds = await selectIds("projects", "project_name", "[UAT]*");
const prefixedTaskIds = await selectIds("tasks", "task_name", "[UAT]*");
const shipmentIds = await selectIds("shipments", "item_name", "[UAT]*");
const activityIds = await selectIds("activity_logs", "title", "[UAT]*");
let projectTaskIds = [];
if (projectIds.length > 0) {
  const { data, error } = await supabase.from("tasks").select("id").in("project_id", projectIds);
  if (error) throw error;
  projectTaskIds = data.map((row) => row.id);
}
const taskIds = [...new Set([...prefixedTaskIds, ...projectTaskIds])];

console.log(`Target project ref: ${projectRef}`);
console.log("WARNING: Production UAT cleanup targets only reserved accounts and [UAT] records.");
console.table([{ auth: authIds.length, employees: employees.length, projects: projectIds.length, tasks: taskIds.length, shipments: shipmentIds.length, activities: activityIds.length }]);
if (dryRun) {
  console.log("UAT cleanup dry-run completed. No changes were made.");
  process.exit(0);
}

if (taskIds.length > 0) {
  await deleteByIds("task_dependencies", "predecessor_task_id", taskIds);
  await deleteByIds("task_dependencies", "successor_task_id", taskIds);
  await deleteByIds("task_notes", "task_id", taskIds);
  await deleteByIds("task_tags", "task_id", taskIds);
  await deleteByIds("task_schedule_memos", "task_id", taskIds);
  await deleteByIds("shipments", "task_id", taskIds);
}
if (projectIds.length > 0) {
  await deleteByIds("activity_logs", "project_id", projectIds);
  await deleteByIds("shipments", "project_id", projectIds);
}
await deleteByIds("shipments", "id", shipmentIds);
await deleteByIds("activity_logs", "id", activityIds);
if (emails.length > 0) {
  const { error } = await supabase.from("activity_logs").delete().in("employee_email", emails);
  if (error) throw error;
}
await deleteByIds("tasks", "id", taskIds);
await deleteByIds("projects", "id", projectIds);
if (authIds.length > 0) await deleteByIds("employees", "auth_user_id", authIds);
for (const userId of authIds) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

const remainingAuth = (await listAllAuthUsers()).filter((user) => emails.includes(user.email?.toLowerCase()));
const { data: remainingEmployees, error: verifyError } = await supabase.from("employees").select("id").in("email", emails);
if (verifyError) throw verifyError;
const remainingProjects = await selectIds("projects", "project_name", "[UAT]*");
const remainingTasks = await selectIds("tasks", "task_name", "[UAT]*");
const remainingShipments = await selectIds("shipments", "item_name", "[UAT]*");
if (remainingAuth.length > 0 || remainingEmployees.length > 0 || remainingProjects.length > 0 || remainingTasks.length > 0 || remainingShipments.length > 0) {
  throw new Error("Cleanup verification failed.");
}
console.log("UAT cleanup completed and verified.");
