"use client";

import { createContext, useContext } from "react";
import type { CurrentEmployee } from "@/lib/auth";

export type AppShellUserContextValue = {
  employee: CurrentEmployee | null;
  authUserId: string | null;
  authEmail: string | null;
  isLoading: boolean;
};

const AppShellUserContext = createContext<AppShellUserContextValue | null>(null);

export const AppShellUserProvider = AppShellUserContext.Provider;

export function useAppShellUser() {
  const value = useContext(AppShellUserContext);
  if (!value) {
    throw new Error("useAppShellUser must be used within AppShellUserProvider");
  }
  return value;
}
