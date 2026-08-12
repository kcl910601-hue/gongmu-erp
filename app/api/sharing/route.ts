import { getLmeContext } from "@/lib/lme-server";
import { isSharePermission } from "@/lib/sharing";

export async function GET() {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });

  const [employeesResult, receivedResult, sentResult, membersResult] = await Promise.all([
    supabase.from("employees").select("id,name,position").eq("active", true).eq("approval_status", "approved").not("auth_user_id", "is", null).neq("id", employee.id).order("name"),
    supabase.from("share_invitations").select("*,shared_item:shared_items(id,item_id,item_type,owner_id),inviter:employees!share_invitations_inviter_id_fkey(id,name),invitee:employees!share_invitations_invitee_id_fkey(id,name)").eq("invitee_id", employee.id).order("created_at", { ascending: false }),
    supabase.from("share_invitations").select("*,shared_item:shared_items(id,item_id,item_type,owner_id),inviter:employees!share_invitations_inviter_id_fkey(id,name),invitee:employees!share_invitations_invitee_id_fkey(id,name)").eq("inviter_id", employee.id).order("created_at", { ascending: false }),
    supabase.from("shared_item_members").select("*,employee:employees(id,name)").order("joined_at", { ascending: false }),
  ]);
  const error = employeesResult.error || receivedResult.error || sentResult.error || membersResult.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const invitations = [...(receivedResult.data ?? []), ...(sentResult.data ?? [])];
  const invitationIds = [...new Set(invitations.map((invitation) => invitation.id))];
  const titlesResult = invitationIds.length > 0 ? await supabase.rpc("get_share_invitation_titles", { p_invitation_ids: invitationIds }) : { data: [], error: null };
  if (titlesResult.error) return Response.json({ error: titlesResult.error.message }, { status: 500 });
  const titles = new Map((titlesResult.data ?? []).map((row: { invitation_id: string; item_title: string }) => [row.invitation_id, row.item_title]));
  const withTitles = <T extends { id: string }>(rows: T[]) => rows.map((row) => ({ ...row, item_title: titles.get(row.id) ?? null }));
  return Response.json({ currentEmployeeId: employee.id, employees: employeesResult.data ?? [], received: withTitles(receivedResult.data ?? []), sent: withTitles(sentResult.data ?? []), members: membersResult.data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 처리할 수 있습니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  let result: { error: { message: string } | null };
  if (action === "invite") {
    const itemId = typeof body.itemId === "string" ? body.itemId : "";
    const inviteeId = typeof body.inviteeId === "number" ? body.inviteeId : Number(body.inviteeId);
    if (!itemId || !Number.isInteger(inviteeId) || !isSharePermission(body.permission)) return Response.json({ error: "공유 대상을 확인해주세요." }, { status: 400 });
    result = await supabase.rpc("create_share_invitation", { p_item_id: itemId, p_invitee_id: inviteeId, p_permission: body.permission });
  } else if (action === "accept" || action === "reject") {
    if (typeof body.invitationId !== "string") return Response.json({ error: "공유 요청을 확인해주세요." }, { status: 400 });
    result = await supabase.rpc("respond_share_invitation", { p_invitation_id: body.invitationId, p_accept: action === "accept" });
  } else if (action === "cancel") {
    if (typeof body.invitationId !== "string") return Response.json({ error: "공유 요청을 확인해주세요." }, { status: 400 });
    result = await supabase.rpc("cancel_share_invitation", { p_invitation_id: body.invitationId });
  } else if (action === "remove_member") {
    if (typeof body.sharedItemId !== "string" || !Number.isInteger(Number(body.employeeId))) return Response.json({ error: "참여자를 확인해주세요." }, { status: 400 });
    result = await supabase.rpc("remove_shared_member", { p_shared_item_id: body.sharedItemId, p_employee_id: Number(body.employeeId) });
  } else if (action === "update_permission") {
    if (typeof body.sharedItemId !== "string" || !Number.isInteger(Number(body.employeeId)) || !isSharePermission(body.permission)) return Response.json({ error: "공유 권한을 확인해주세요." }, { status: 400 });
    result = await supabase.rpc("update_shared_member_permission", { p_shared_item_id: body.sharedItemId, p_employee_id: Number(body.employeeId), p_permission: body.permission });
  } else {
    return Response.json({ error: "지원하지 않는 공유 작업입니다." }, { status: 400 });
  }
  if (result.error) return Response.json({ error: result.error.message }, { status: 409 });
  return Response.json({ success: true });
}
