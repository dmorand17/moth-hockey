import Link from "next/link";
import type { ReactNode } from "react";

// Quiet placeholder for sections with nothing to show yet. `compact` renders a
// single muted line instead of a card.
export function EmptyState({
  title,
  children,
  linkHref,
  linkLabel,
  compact = false,
}: {
  title: string;
  children?: ReactNode;
  linkHref?: string;
  linkLabel?: string;
  compact?: boolean;
}) {
  const link = linkHref && linkLabel && (
    <Link
      href={linkHref}
      className="font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-[44px] whitespace-nowrap"
    >
      {linkLabel} <span aria-hidden className="ml-1">→</span>
    </Link>
  );
  if (compact) {
    return (
      <p className="flex flex-wrap items-center gap-x-3 text-[14px] text-ink-faint">
        <span>{title}</span>
        {link}
      </p>
    );
  }
  return (
    <div className="panel-bare px-4 py-5 sm:px-6">
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-[14px] leading-5 text-ink-faint">{children}</div>}
      {link && <div className="mt-1 text-[14px]">{link}</div>}
    </div>
  );
}
