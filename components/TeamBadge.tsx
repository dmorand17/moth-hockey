import Link from "next/link";
import { teamAbbr } from "@/lib/format";

type Props = {
  name: string;
  slug: string;
  color: string;
  align?: "left" | "right";
  className?: string;
  asChild?: boolean;
  size?: "sm" | "md" | "lg";
};

export function TeamBadge({
  name,
  slug,
  color,
  align = "left",
  className = "",
  asChild = false,
  size = "md",
}: Props) {
  const sizes = {
    sm: { bar: "w-1 h-4", text: "text-[14px]" },
    md: { bar: "w-1 h-5", text: "text-[15px]" },
    lg: { bar: "w-1 h-6", text: "text-[18px] md:text-[20px]" },
  };
  const s = sizes[size];
  const inner = (
    <>
      <span
        aria-hidden
        className={`${s.bar} shrink-0 rounded-[1px]`}
        style={{ background: color }}
      />
      <span className={`truncate ${s.text} font-medium tracking-tight`}>{name}</span>
    </>
  );
  const layout = `inline-flex items-center gap-2.5 ${
    align === "right" ? "flex-row-reverse" : ""
  } ${className}`;

  if (asChild) return <span className={layout}>{inner}</span>;
  return (
    <Link href={`/teams/${slug}`} className={`${layout} min-h-11 hover:text-ink transition-colors`}>
      {inner}
    </Link>
  );
}

// Compact team marker for dense rows: color dot + abbreviation, with the full
// name available to screen readers and on hover.
export function TeamTag({ name, color, className = "" }: { name: string; color: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.04em] text-ink-faint ${className}`} title={name}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span aria-hidden>{teamAbbr(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
