import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white disabled:bg-gray-400",
  secondary: "border border-slate-300 bg-white text-slate-700 disabled:opacity-50",
  danger: "border border-slate-300 bg-white text-red-600 disabled:text-gray-400",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 disabled:opacity-50",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-2 py-0.5 text-sm",
  md: "px-4 py-2",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
