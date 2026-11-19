import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  /** Short secondary label above the title. */
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  linkHref?: string;
  linkLabel?: string;
  /** Right-aligned slot (e.g. a season selector or a collapse toggle). */
  action?: ReactNode;
  size?: "md" | "lg";
  /** Heading level for the title. Use "h1" for the page's primary heading. */
  as?: "h1" | "h2";
  id?: string;
};

// The one section-header pattern: 12px label above a Bebas title, optional
// subtitle, optional right-aligned action.
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  linkHref,
  linkLabel,
  action,
  size = "md",
  as: Heading = "h2",
  id,
}: Props) {
  const titleSize =
    size === "lg"
      ? "text-[40px] leading-[44px] md:text-[56px] md:leading-[64px]"
      : "text-[26px] leading-[30px] md:text-[32px] md:leading-[36px]";
  return (
    <div className="mb-4 flex items-end justify-between gap-x-4 gap-y-2 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <Heading id={id} className={`font-display ${titleSize} tracking-[0.02em] text-ink`}>
          {title}
        </Heading>
        {subtitle && <p className="mt-1 text-[14px] leading-5 text-ink-faint">{subtitle}</p>}
      </div>
      {(action || (linkHref && linkLabel)) && (
        <div className="max-w-full flex flex-wrap items-center gap-x-3">
          {action}
          {linkHref && linkLabel && (
            <Link
              href={linkHref}
              className="text-[14px] font-semibold text-ice hover:text-ink transition-colors whitespace-nowrap inline-flex items-center min-h-[44px]"
            >
              {linkLabel} <span aria-hidden className="ml-1">→</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
