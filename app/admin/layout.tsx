import Link from "next/link";
import { requireRole } from "@/lib/auth";

const adminNav = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/players", label: "Players" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin"]);

  return (
    <div className="rise">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-[0.06em] text-ink">ADMIN</h1>
        <p className="eyebrow mt-2">League management</p>
      </header>

      <nav className="mb-6 border-b border-rule flex gap-1 -mx-1 overflow-x-auto">
        {adminNav.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="px-4 min-h-11 inline-flex items-center font-display text-[14px] tracking-[0.14em] uppercase text-ink-dim hover:text-ink border-b-2 border-transparent hover:border-ice transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
