import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter, JetBrains_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";
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
  manifest: "/manifest.webmanifest",
  // Tells iOS Safari to launch chromeless from the home screen.
  appleWebApp: {
    capable: true,
    title: "M.O.T.H",
    statusBarStyle: "black-translucent",
  },
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
  const authLinks: { href: string; label: string; match?: string }[] = session
    ? [
        ...(session.role === "admin"
          ? [{ href: "/admin/players", label: "Admin", match: "/admin" }]
          : session.role === "team_captain"
            ? [{ href: "/captains/contacts", label: "Captains", match: "/captains" }]
            : []),
        ...(session.role === "admin" || session.role === "scorekeeper"
          ? [{ href: "/score", label: "Score", match: "/score" }]
          : []),
        { href: "/account", label: "Account" },
      ]
    : [{ href: "/login", label: "Log in" }];

  return (
    <html
      lang="en"
      className={`${bebas.variable} ${inter.variable} ${jetbrains.variable} antialiased`}
    >
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 border-b border-rule-strong bg-board/80 backdrop-blur-md">
          <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-goal via-rule-strong to-ice opacity-50" />
          <div className="mx-auto max-w-6xl px-4 sm:px-5 py-2.5 md:py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group tap min-w-0">
              <Image
                src="/moth-logo.png"
                alt="M.O.T.H Hockey League logo"
                width={40}
                height={40}
                priority
                className="h-9 w-9 sm:h-11 sm:w-11 shrink-0"
              />
              <div className="leading-none min-w-0">
                <div className="font-display text-[20px] sm:text-[26px] tracking-[0.06em] text-ink truncate">
                  M.O.T.H <span className="text-goal">HOCKEY</span>
                </div>
                <div className="eyebrow mt-1 text-[10px] hidden sm:block">Mostly Over the Hill Hockey League</div>
              </div>
            </Link>

            <nav className="hidden md:flex items-stretch">
              {navLinks.map((link, i) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  className={`relative px-4 py-2 font-display text-[15px] tracking-[0.14em] uppercase text-ink-dim hover:text-ink transition-colors inline-flex items-center min-h-[44px] ${
                    i > 0 ? "border-l border-rule" : ""
                  }`}
                  activeClassName="text-ink after:content-[''] after:absolute after:left-4 after:right-4 after:bottom-0 after:h-[2px] after:bg-ice"
                />
              ))}
            </nav>

            {/* Auth slot — same row as the brand on every breakpoint */}
            <div className="flex items-stretch shrink-0">
              {authLinks.map((link, i) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  match={link.match}
                  className={`relative px-3 sm:px-4 font-display text-[12px] sm:text-[14px] tracking-[0.14em] uppercase text-ice hover:text-ink transition-colors inline-flex items-center min-h-[44px] whitespace-nowrap ${
                    i > 0 ? "border-l border-rule" : ""
                  }`}
                  activeClassName="text-ink after:content-[''] after:absolute after:left-3 sm:after:left-4 after:right-3 sm:after:right-4 after:bottom-0 after:h-[2px] after:bg-ice"
                />
              ))}
            </div>
          </div>
          {/* Mobile primary nav — auth lives in the brand row above.
              The whole header is sticky, so this row pins along with the brand. */}
          <nav className="md:hidden flex border-t border-rule bg-board/85 backdrop-blur-md">
            {navLinks.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                className="relative flex-1 inline-flex items-center justify-center min-h-[44px] px-2 font-display text-[11.5px] tracking-[0.14em] uppercase text-ink-dim hover:text-ink transition-colors whitespace-nowrap"
                activeClassName="text-ink after:content-[''] after:absolute after:inset-x-2 after:top-0 after:h-[2px] after:bg-ice"
              />
            ))}
          </nav>
        </header>

        <main className="relative z-[1] flex-1 mx-auto w-full max-w-6xl px-4 sm:px-5 py-4 md:py-12">
          {children}
        </main>

        <footer className="relative z-[1] mt-auto border-t border-rule">
          <div className="mx-auto max-w-6xl px-4 sm:px-5 py-4 sm:py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
            <div className="font-display text-[15px] tracking-[0.14em] text-ink-dim">
              M.O.T.H HOCKEY <span className="text-rule-strong mx-2">/</span>{" "}
              <span className="text-ink-faint">SPRING 2026</span>
            </div>
            <div className="eyebrow inline-flex items-center gap-1.5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
              >
                <path d="M10 1.5H14V5.7A2 2 0 0 0 14.55 7.08L15.65 8.26A2.8 2.8 0 0 1 16.4 10.2V20A1.5 1.5 0 0 1 14.9 21.5H9.1A1.5 1.5 0 0 1 7.6 20V10.2A2.8 2.8 0 0 1 8.35 8.26L9.45 7.08A2 2 0 0 0 10 5.7Z" />
                <path d="M7.6 13H16.4" />
              </svg>
              Powered by the Milkman
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
