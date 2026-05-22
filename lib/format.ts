export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatPeriod(period: number, decidedIn?: string | null): string {
  if (period === 4) return "OT";
  if (period === 5 || decidedIn === "shootout") return "SO";
  return `P${period}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}
