import Link from "next/link";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  linkHref?: string;
  linkLabel?: string;
  size?: "md" | "lg";
};

export function SectionHeader({ eyebrow, title, subtitle, linkHref, linkLabel, size = "md" }: Props) {
  const titleSize = size === "lg" ? "text-[44px] md:text-[60px]" : "text-[32px] md:text-[40px]";
  return (
    <div className="goal-line mb-6 flex items-end justify-between gap-4 flex-wrap">
      <div>
        {eyebrow && <div className="eyebrow text-goal">{eyebrow}</div>}
        <h2 className={`font-display ${titleSize} leading-none tracking-[0.04em] mt-1`}>
          {title.toUpperCase()}
        </h2>
        {subtitle && <p className="eyebrow mt-2 normal-case tracking-[0.06em]">{subtitle}</p>}
      </div>
      {linkHref && linkLabel && (
        <Link href={linkHref} className="eyebrow hover:text-ink transition-colors whitespace-nowrap">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
