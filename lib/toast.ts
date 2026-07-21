export type ToastTone = "success" | "info" | "warning" | "error";

export type ToastMessage = {
  id: string;
  message: string;
  tone: ToastTone;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
};

export type ToastOptions = Pick<
  ToastMessage,
  "duration" | "actionLabel" | "onAction"
>;

function dispatchToast(
  message: string,
  tone: ToastTone,
  options: ToastOptions = {}
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastMessage>("erp-toast", {
      detail: {
        id: crypto.randomUUID(),
        message,
        tone,
        ...options,
      },
    })
  );
}

export const toast = {
  success: (message: string, options?: ToastOptions) =>
    dispatchToast(message, "success", options),
  info: (message: string, options?: ToastOptions) =>
    dispatchToast(message, "info", options),
  warning: (message: string, options?: ToastOptions) =>
    dispatchToast(message, "warning", options),
  error: (message: string, options?: ToastOptions) =>
    dispatchToast(message, "error", options),
};
