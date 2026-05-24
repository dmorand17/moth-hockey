import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { getAuthSession } from "@/lib/auth";
import "./globals.css";

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "M.O.T.H Hockey — Spring 2026",
  description: "Mostly Over The Hill hockey league.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
};

const navLinks = [
  { href: "/standings", label: "Standings" },
  { href: "/teams", label: "Teams" },
  { href: "/schedule", label: "Schedule" },
  { href: "/stats", label: "Stats" },
  { href: "/about", label: "About" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getAuthSession();
  const authLinks: { href: string; label: string }[] = session
    ? [
        ...(session.role === "admin"
          ? [{ href: "/admin/users", label: "Admin" }]
          : session.role === "team_captain"
            ? [{ href: "/captains/contacts", label: "Captains" }]
            : []),
        { href: "/account", label: "Account" },
      ]
    : [{ href: "/login", label: "Log in" }];

  return (
    <html
      lang="en"
      className={`${bebas.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="relative z-10 border-b border-rule-strong bg-board/80 backdrop-blur-md md:sticky md:top-0">
          <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-goal via-rule-strong to-ice opacity-50" />
          <div className="mx-auto max-w-6xl px-4 sm:px-5 py-2.5 md:py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group tap min-w-0">
              <div className="relative h-8 w-8 sm:h-10 sm:w-10 shrink-0">
                <div className="absolute inset-0 rounded-sm bg-board-2 border border-rule-strong" />
                <div className="absolute inset-1 rounded-[2px] bg-gradient-to-br from-goal to-goal-glow opacity-90" />
                <div className="absolute inset-0 flex items-center justify-center font-display text-board text-[12px] sm:text-[15px] tracking-[0.05em]">
                  M
                </div>
              </div>
              <div className="leading-none min-w-0">
                <div className="font-display text-[20px] sm:text-[26px] tracking-[0.06em] text-ink truncate">
                  M.O.T.H <span className="text-goal">HOCKEY</span>
                </div>
                <div className="eyebrow mt-1 text-[10px] hidden sm:block">Mostly Over The Hill · EST. PRE-COVID</div>
              </div>
            </Link>

            <nav className="hidden md:flex items-stretch">
              {navLinks.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 font-display text-[15px] tracking-[0.14em] uppercase text-ink-dim hover:text-ink transition-colors relative inline-flex items-center min-h-[44px] ${
                    i > 0 ? "border-l border-rule" : ""
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Auth slot — same row as the brand on every breakpoint */}
            <div className="flex items-stretch shrink-0">
              {authLinks.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 sm:px-4 font-display text-[12px] sm:text-[14px] tracking-[0.14em] uppercase text-ice hover:text-ink transition-colors inline-flex items-center min-h-[44px] whitespace-nowrap ${
                    i > 0 ? "border-l border-rule" : ""
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          {/* Mobile primary nav — auth lives in the brand row above */}
          <nav className="md:hidden sticky top-0 z-10 flex border-t border-rule bg-board/85 backdrop-blur-md">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex-1 inline-flex items-center justify-center min-h-[44px] px-2 font-display text-[11.5px] tracking-[0.14em] uppercase text-ink-dim hover:text-ink transition-colors whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="relative z-[1] flex-1 mx-auto w-full max-w-6xl px-4 sm:px-5 py-5 md:py-12">
          {children}
        </main>

        <footer className="relative z-[1] mt-auto border-t border-rule">
          <div className="mx-auto max-w-6xl px-4 sm:px-5 py-4 sm:py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
            <div className="font-display text-[15px] tracking-[0.14em] text-ink-dim">
              M.O.T.H HOCKEY <span className="text-rule-strong mx-2">/</span>{" "}
              <span className="text-ink-faint">SPRING 2026</span>
            </div>
            <div className="eyebrow">Powered by the Milkman</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
