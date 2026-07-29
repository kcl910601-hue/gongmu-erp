import { supabase } from "@/lib/supabase";

export type SettingsItemEntity = "task_template" | "employee" | "partner";
export type SettingsItemAction = "deleted" | "deactivated" | "blocked";

export type SettingsItemActionResult = {
  success: boolean;
  action: SettingsItemAction;
  message: string;
  referenceCount: number;
};

export async function manageSettingsItem(
  entity: SettingsItemEntity,
  targetId: number,
  execute: boolean
): Promise<SettingsItemActionResult> {
  const { data, error } = await supabase.rpc("manage_settings_item", {
    p_entity: entity,
    p_target_id: targetId,
    p_execute: execute,
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("설정 항목 처리 결과가 올바르지 않습니다.");
  }

  const result = data as Partial<SettingsItemActionResult>;
  if (
    typeof result.success !== "boolean" ||
    !result.action ||
    !["deleted", "deactivated", "blocked"].includes(result.action)
  ) {
    throw new Error("설정 항목 처리 결과가 올바르지 않습니다.");
  }

  return {
    success: result.success,
    action: result.action,
    message: result.message ?? "설정 항목을 처리했습니다.",
    referenceCount: result.referenceCount ?? 0,
  };
}
