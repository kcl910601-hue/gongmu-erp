"use client";

import { useEffect, useState } from "react";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { hasPermission, type PermissionAction } from "@/lib/permissions";

export function usePermission() {
  const [employee, setEmployee] = useState<CurrentEmployee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getCurrentEmployee().then((current) => {
      if (!cancelled) {
        setEmployee(current);
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return {
    employee,
    role: employee?.role ?? null,
    isLoading,
    can: (action: PermissionAction) => hasPermission(employee?.role, action),
  };
}
