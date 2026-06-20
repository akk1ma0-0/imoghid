import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "rounded-lg px-4 py-2 font-medium transition-colors",
        variant === "primary" && "bg-black text-white hover:bg-gray-800",
        variant === "secondary" &&
          "border border-gray-300 text-gray-900 hover:bg-gray-100",
        className,
      )}
      {...props}
    />
  );
}
