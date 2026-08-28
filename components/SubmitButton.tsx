"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  disabled,
  pendingLabel,
  className,
  ...rest
}: {
  children: ReactNode;
  disabled?: boolean;
  pendingLabel?: string;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      type="submit"
      disabled={pending || disabled}
      className={className}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
