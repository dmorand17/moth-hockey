import Link from "next/link";

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
    sm: { bar: "w-1 h-4", text: "text-[13px]" },
    md: { bar: "w-1 h-5", text: "text-[15px]" },
    lg: { bar: "w-1.5 h-7", text: "text-[18px] md:text-[20px]" },
  };
  const s = sizes[size];
  const inner = (
    <>
      <span
        aria-hidden
        className={`${s.bar} shrink-0 rounded-[1px]`}
        style={{ background: color, boxShadow: `0 0 8px ${color}55` }}
      />
      <span className={`truncate ${s.text} font-medium tracking-tight`}>{name}</span>
    </>
  );
  const layout = `inline-flex items-center gap-2.5 ${
    align === "right" ? "flex-row-reverse" : ""
  } ${className}`;

  if (asChild) return <span className={layout}>{inner}</span>;
  return (
    <Link href={`/teams/${slug}`} className={`${layout} hover:text-ink transition-colors`}>
      {inner}
    </Link>
  );
}
