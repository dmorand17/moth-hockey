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
      type="submit"
      disabled={pending || disabled}
      className={className}
      {...rest}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
