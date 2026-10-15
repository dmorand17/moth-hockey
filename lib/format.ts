export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Cash-register style mask for a clock typed on a numeric keypad (no ":" key):
// digits shift in from the right, so "1117" reads as "11:17".
export function maskClockInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(-4);
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  return `${padded.slice(0, -2)}:${padded.slice(-2)}`;
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

// Formats a US phone number as ###-###-#### as the user types. Strips all
// non-digits, caps at 10, and inserts dashes after positions 3 and 6.
export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
