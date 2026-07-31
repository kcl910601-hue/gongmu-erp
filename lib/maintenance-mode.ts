import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdmin, type CurrentEmployee } from "./auth.ts";

export const MAINTENANCE_MODE_KEY = "maintenance_mode";
export const MAINTENANCE_MODE_UPDATED_EVENT = "maintenance-mode:updated";
export const DEFAULT_MAINTENANCE_MESSAGE = "현재 시스템 점검 중입니다.";

export type MaintenanceModeSetting = {
  enabled: boolean;
  message: string;
  updated_at: string | null;
  updated_by_name: string | null;
};

type AppSettingsClient = Pick<SupabaseClient, "from">;

export function getDefaultMaintenanceModeSetting(): MaintenanceModeSetting {
  return {
    enabled: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    updated_at: null,
    updated_by_name: null,
  };
}

export function parseMaintenanceModeSetting(value: unknown): MaintenanceModeSetting {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultMaintenanceModeSetting();
  }

  const candidate = value as Record<string, unknown>;
  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : false,
    message: typeof candidate.message === "string" && candidate.message.trim()
      ? candidate.message.trim()
      : DEFAULT_MAINTENANCE_MESSAGE,
    updated_at: typeof candidate.updated_at === "string" ? candidate.updated_at : null,
    updated_by_name: typeof candidate.updated_by_name === "string" && candidate.updated_by_name.trim()
      ? candidate.updated_by_name.trim()
      : null,
  };
}

export function shouldBlockForMaintenance(
  employee: CurrentEmployee | null,
  setting: MaintenanceModeSetting
) {
  return setting.enabled && !isAdmin(employee);
}

export function canManageMaintenanceMode(employee: CurrentEmployee | null) {
  return isAdmin(employee);
}

export async function getMaintenanceModeSetting(client: AppSettingsClient) {
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", MAINTENANCE_MODE_KEY)
    .maybeSingle();

  if (error) {
    console.error("maintenance mode setting load error:", error.message);
    return getDefaultMaintenanceModeSetting();
  }

  return parseMaintenanceModeSetting(data?.value);
}

export async function updateMaintenanceModeSetting(
  client: AppSettingsClient,
  input: {
    enabled: boolean;
    message: string;
    authUserId: string;
    updatedByName: string;
  }
) {
  const updatedAt = new Date().toISOString();
  const value: MaintenanceModeSetting = {
    enabled: input.enabled,
    message: input.message.trim() || DEFAULT_MAINTENANCE_MESSAGE,
    updated_at: updatedAt,
    updated_by_name: input.updatedByName,
  };
  const { data, error } = await client
    .from("app_settings")
    .upsert({
      key: MAINTENANCE_MODE_KEY,
      value,
      description: "ERP 전역 시스템 점검모드 설정",
      updated_by: input.authUserId,
      updated_at: updatedAt,
    }, { onConflict: "key" })
    .select("value")
    .single();

  if (error) throw new Error(error.message);
  return parseMaintenanceModeSetting(data.value);
}
