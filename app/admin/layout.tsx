import { requireRole } from "@/lib/auth";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin"]);

  return (
    <div className="rise">
      <div className="mb-6 flex items-start justify-between gap-4">
        <header>
          <h1 className="font-display text-3xl tracking-[0.06em] text-ink">ADMIN</h1>
          <p className="eyebrow mt-2">League management</p>
        </header>

        <AdminNav />
      </div>

      {children}
    </div>
  );
}
