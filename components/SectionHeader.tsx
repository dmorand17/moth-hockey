import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

type Accent = "goal" | "ice" | "gold";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  linkHref?: string;
  linkLabel?: string;
  size?: "md" | "lg";
  accent?: Accent;
};

const ACCENT: Record<Accent, string> = {
  goal: "var(--goal)",
  ice: "var(--ice)",
  gold: "#fbbf24",
};

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  linkHref,
  linkLabel,
  size = "md",
  accent = "goal",
}: Props) {
  const titleSize =
    size === "lg"
      ? "text-[30px] sm:text-[40px] md:text-[56px]"
      : "text-[22px] sm:text-[28px] md:text-[36px]";
  const accentColor = ACCENT[accent];
  return (
    <div
      className="goal-line mb-3 sm:mb-5 flex items-end justify-between gap-3 flex-wrap"
      style={{ "--accent": accentColor } as CSSProperties}
    >
      <div>
        {eyebrow && (
          <div className="eyebrow" style={{ color: accentColor }}>
            {eyebrow}
          </div>
        )}
        <h2 className={`font-display ${titleSize} leading-none tracking-[0.04em] mt-1`}>
          {title.toUpperCase()}
        </h2>
        {subtitle && <p className="eyebrow mt-2 normal-case tracking-[0.06em]">{subtitle}</p>}
      </div>
      {linkHref && linkLabel && (
        <Link
          href={linkHref}
          className="eyebrow hover:text-ink transition-colors whitespace-nowrap inline-flex items-center min-h-[44px]"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
