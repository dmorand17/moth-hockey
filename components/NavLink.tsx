"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Top-nav link that highlights when the current route is (under) its target.
// `match` overrides the prefix used for the active check — e.g. the "Admin"
// link points at /admin/players but should stay active across all /admin/*.
export function NavLink({
  href,
  label,
  match,
  className = "",
  activeClassName = "",
}: {
  href: string;
  label: string;
  match?: string;
  className?: string;
  activeClassName?: string;
}) {
  const pathname = usePathname();
  const base = match ?? href;
  const active = pathname === base || pathname.startsWith(base + "/");

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : ""}`}
    >
      {label}
    </Link>
  );
}
