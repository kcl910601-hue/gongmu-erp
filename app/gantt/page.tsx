import { redirect } from "next/navigation";

export default function LegacyGanttPage() {
  redirect("/calendar?view=gantt");
}
