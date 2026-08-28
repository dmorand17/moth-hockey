"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  resetOnSuccess?: boolean;
  successToast?: string; // overrides result.message on success
  children: React.ReactNode;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action">;

export function ActionForm({
  action,
  resetOnSuccess,
  successToast,
  children,
  ...formProps
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  // useActionState needs (prevState, formData); adapt our (formData) action.
  const [result, formAction] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) => action(fd),
    null,
  );

  useEffect(() => {
    if (!result) return; // skip initial
    if (result.ok) {
      toast.success(successToast ?? result.message ?? "Saved");
      if (resetOnSuccess) formRef.current?.reset();
    } else {
      toast.error(result.error);
    }
  }, [result, resetOnSuccess, successToast]);

  return (
    <form ref={formRef} action={formAction} {...formProps}>
      {children}
    </form>
  );
}
