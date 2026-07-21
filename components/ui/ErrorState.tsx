import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ErrorState({
  message = "데이터를 불러오지 못했습니다.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl bg-red-50 p-8 text-center">
      <AlertTriangle className="text-red-500" size={24} />
      <p className="mt-3 text-sm font-semibold text-red-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          다시 시도
        </Button>
      )}
    </div>
  );
}
