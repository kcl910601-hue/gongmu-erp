import { createClient } from "@supabase/supabase-js";

const APPROVED_PRODUCTION_REF = "cropibqvvzpxlnqpkyto";
const dryRun = process.argv.includes("--dry-run");
const accounts = [
  { key: "TEST_ADMIN", email: "uat.admin@example.com", name: "[UAT] Admin", role: "admin", active: true, approval: "approved" },
  { key: "TEST_MANAGER", email: "uat.manager@example.com", name: "[UAT] Manager", role: "manager", active: true, approval: "approved" },
  { key: "TEST_STAFF", email: "uat.staff@example.com", name: "[UAT] Staff", role: "staff", active: true, approval: "approved" },
  { key: "TEST_VIEWER", email: "uat.viewer@example.com", name: "[UAT] Viewer", role: "viewer", active: true, approval: "approved" },
  { key: "TEST_INACTIVE", email: "uat.inactive@example.com", name: "[UAT] Inactive", role: "staff", active: false, approval: "approved" },
  { key: "TEST_PENDING", email: "uat.pending@example.com", name: "[UAT] Pending", role: "staff", active: true, approval: "pending" },
  { key: "TEST_REJECTED", email: "uat.rejected@example.com", name: "[UAT] Rejected", role: "staff", active: true, approval: "rejected" },
];

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UAT_PASSWORD", "UAT_PROJECT_REF", "UAT_ENVIRONMENT"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) throw new Error(`UAT seed aborted: missing environment variables: ${missing.join(", ")}`);

const environment = process.env.UAT_ENVIRONMENT.toLowerCase();
const projectRef = process.env.UAT_PROJECT_REF;
const supabaseUrl = new URL(process.env.SUPABASE_URL);
if (!new Set(["development", "test", "production"]).has(environment)) throw new Error("UAT seed aborted: unsupported UAT_ENVIRONMENT.");
if (environment === "production" && (process.env.ALLOW_PRODUCTION_UAT !== "true" || projectRef !== APPROVED_PRODUCTION_REF)) {
  throw new Error("UAT seed aborted: production requires ALLOW_PRODUCTION_UAT=true and the approved UAT_PROJECT_REF.");
}
if (!supabaseUrl.hostname.startsWith(`${projectRef}.`)) throw new Error("UAT seed aborted: SUPABASE_URL does not match UAT_PROJECT_REF.");
if (process.env.UAT_PASSWORD.length < 12) throw new Error("UAT seed aborted: UAT_PASSWORD must contain at least 12 characters.");

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

async function verifySeed() {
  const authUsers = await listAllAuthUsers();
  const expectedEmails = new Set(accounts.map((account) => account.email));
  const uatAuth = authUsers.filter((user) => expectedEmails.has(user.email?.toLowerCase()));
  const { data: employees, error } = await supabase
    .from("employees")
    .select("id,name,email,auth_user_id,role,active,approval_status")
    .in("email", [...expectedEmails]);
  if (error) throw error;
  const results = accounts.map((account) => {
    const auth = uatAuth.find((user) => user.email?.toLowerCase() === account.email);
    const employee = employees.find((row) => row.email?.toLowerCase() === account.email);
    const pass = Boolean(auth && employee && employee.auth_user_id === auth.id && employee.role === account.role && employee.active === account.active && employee.approval_status === account.approval);
    return { account: account.key, auth: Boolean(auth), employee: Boolean(employee), linked: employee?.auth_user_id === auth?.id, pass };
  });
  console.table(results);
  if (results.some((result) => !result.pass)) throw new Error("UAT seed verification failed.");
}

console.log(`Target project ref: ${projectRef}`);
console.log("WARNING: the target is a Production project. Only reserved UAT accounts may be created.");
console.table(accounts.map(({ key, email, role, active, approval }) => ({ account: key, email, role, active, approval })));

const authUsers = await listAllAuthUsers();
const expectedEmails = accounts.map((account) => account.email);
const authConflicts = authUsers.filter((user) => expectedEmails.includes(user.email?.toLowerCase()));
const { data: employeeConflicts, error: employeeConflictError } = await supabase
  .from("employees")
  .select("id,name,email,auth_user_id")
  .in("email", expectedEmails);
if (employeeConflictError) throw employeeConflictError;
if (authConflicts.length > 0 || employeeConflicts.length > 0) {
  console.table(authConflicts.map((user) => ({ type: "auth", email: user.email })));
  console.table(employeeConflicts.map((employee) => ({ type: "employee", email: employee.email })));
  throw new Error("UAT seed aborted: reserved email already exists. No changes were made.");
}

if (dryRun) {
  console.log("UAT seed dry-run passed. No database changes were made.");
  process.exit(0);
}

const createdUserIds = [];
try {
  for (const account of accounts) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: process.env.UAT_PASSWORD,
      email_confirm: true,
      user_metadata: { name: account.name, test_account: account.key },
      app_metadata: { uat_seed: "sprint-6-4" },
    });
    if (error) throw error;
    createdUserIds.push(data.user.id);

    const employeeState = {
      auth_user_id: data.user.id,
      name: account.name,
      email: account.email,
      role: account.role,
      active: account.active,
      approval_status: account.approval,
      approved_at: account.approval === "approved" ? new Date().toISOString() : null,
      approved_by: account.approval === "approved" ? "sprint-6-4-admin-api" : null,
      rejected_at: account.approval === "rejected" ? new Date().toISOString() : null,
    };
    const { data: updated, error: updateError } = await supabase
      .from("employees")
      .update(employeeState)
      .eq("auth_user_id", data.user.id)
      .select("id");
    if (updateError) throw updateError;
    if (updated.length === 0) {
      const { error: insertError } = await supabase.from("employees").insert(employeeState);
      if (insertError) throw insertError;
    }
  }
  await verifySeed();
  console.log("UAT seed completed and verified.");
} catch (error) {
  console.error("UAT seed failed. Removing accounts created by this run.");
  if (createdUserIds.length > 0) await supabase.from("employees").delete().in("auth_user_id", createdUserIds);
  const rollbackErrors = [];
  for (const userId of [...createdUserIds].reverse()) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) rollbackErrors.push(deleteError.message);
  }
  if (rollbackErrors.length > 0) console.error(`Compensation incomplete: ${rollbackErrors.join("; ")}`);
  throw error;
}
