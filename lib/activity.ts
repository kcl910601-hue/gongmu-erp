import { supabase } from "@/lib/supabase";
import { getCurrentEmployee } from "@/lib/auth";

type ActivityInput = {
  actionType: string;
  targetType?: string;
  targetId?: number;
  projectId?: number;
  title: string;
  description?: string;
};

export async function addActivity(data: ActivityInput) {
  const employee = await getCurrentEmployee();

  if (!employee) return;

  const { error } = await supabase
    .from("activity_logs")
    .insert([
      {
        employee_name: employee.name,
        employee_email: employee.email,
        action_type: data.actionType,
        target_type: data.targetType,
        target_id: data.targetId,
        project_id: data.projectId,
        title: data.title,
        description: data.description,
      },
    ]);

  if (error) {
  console.error("activity log error:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    });
  }
}