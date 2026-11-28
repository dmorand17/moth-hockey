import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Toaster } from "sonner";
import { NavLink } from "@/components/NavLink";
import { AuthMenu } from "@/components/AuthMenu";
import { BottomNav, MobileHeaderController } from "@/components/MobileChrome";
import { getAuthSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { HeaderSeasonPicker } from "@/components/HeaderSeasonPicker";
import { getCurrentSeason, getSeasons, SEASON_COOKIE } from "@/lib/queries";
import "./globals.css";

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

// Variable font (400–700). next/font generates a size-adjusted fallback, so
// the swap doesn't shift layout.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Absolute base for OpenGraph/Twitter image URLs. Uses the prod domain on
// Vercel, falls back to localhost in dev.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3001");

const SITE_DESCRIPTION =
  "Standings, schedule, stats and box scores for the Mostly Over The Hill hockey league.";

// Title template + OG/Twitter tags. The default title carries the current
// season from the same source the pages read, so it never goes stale.
export async function generateMetadata(): Promise<Metadata> {
  const season = await getCurrentSeason();
  const defaultTitle = season ? `M.O.T.H Hockey — ${season.name}` : "M.O.T.H Hockey";
  return {
    metadataBase: new URL(siteUrl),
    title: { default: defaultTitle, template: "%s — M.O.T.H Hockey" },
    description: SITE_DESCRIPTION,
    manifest: "/manifest.webmanifest",
    openGraph: {
      siteName: "M.O.T.H Hockey",
      title: defaultTitle,
      description: SITE_DESCRIPTION,
      type: "website",
      images: [
        { url: "/moth-banner-dark.png", width: 1200, height: 670, alt: "M.O.T.H Hockey League" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description: SITE_DESCRIPTION,
      images: ["/moth-banner-dark.png"],
    },
    // Tells iOS Safari to launch chromeless from the home screen.
    appleWebApp: {
      capable: true,
      title: "M.O.T.H",
      statusBarStyle: "black-translucent",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  // Draw under the notch / home indicator; the header and bottom bar pad
  // themselves with env(safe-area-inset-*).
  viewportFit: "cover",
};

const navLinks = [
  { href: "/standings", label: "Standings" },
  { href: "/schedule", label: "Schedule" },
  { href: "/stats", label: "Stats" },
  { href: "/about", label: "About" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, currentSeason, seasons, cookieJar] = await Promise.all([
    getAuthSession(),
    getCurrentSeason(),
    getSeasons(),
    cookies(),
  ]);
  const seasonLabel = currentSeason?.name ?? "Off Season";
  const authLinks: { href: string; label: string; match?: string }[] = session
    ? [
        ...(session.role === "admin"
          ? [{ href: "/admin/players", label: "Admin", match: "/admin" }]
          : session.role === "team_captain"
            ? [{ href: "/captains/contacts", label: "Captains", match: "/captains" }]
            : []),
        ...(session.role === "admin" || session.role === "scorekeeper"
          ? [{ href: "/score", label: "Scorekeeper", match: "/score" }]
          : []),
        { href: "/account", label: "Account" },
      ]
    : [{ href: "/login", label: "Log in" }];

  return (
    <html
      lang="en"
      className={`${bebas.variable} ${inter.variable} antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's
          cz-shortcut-listen) inject attributes on <body> before hydration,
          causing a benign attribute mismatch. Scoped to this element only. */}
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ice focus:px-4 focus:py-2 focus:text-board focus:font-semibold"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-20 border-b border-rule bg-board/85 backdrop-blur-md pt-[env(safe-area-inset-top)] md:pt-0">
          <div className="mx-auto max-w-6xl px-4 sm:px-5 h-14 md:h-auto md:py-3 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group tap min-w-0">
              <Image
                src="/moth-logo.png"
                alt="M.O.T.H Hockey League logo"
                width={40}
                height={40}
                priority
                className="h-9 w-9 md:h-11 md:w-11 shrink-0"
              />
              <div className="leading-none min-w-0">
                <div className="font-display text-[20px] sm:text-[26px] tracking-[0.06em] text-ink truncate">
                  M.O.T.H <span className="text-goal md:max-lg:hidden">HOCKEY</span>
                </div>
                <div className="mt-1 text-[12px] leading-4 text-ink-faint whitespace-nowrap hidden lg:block">Mostly Over the Hill Hockey League</div>
              </div>
            </Link>

            <nav aria-label="Primary" className="hidden md:flex items-stretch gap-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  className="relative px-3 py-2 text-[15px] font-semibold text-ink-dim hover:text-ink hover:bg-board-3 rounded-md transition-colors inline-flex items-center min-h-[44px]"
                  activeClassName="!text-ink after:content-[''] after:absolute after:left-3 after:right-3 after:-bottom-[13px] after:h-[2px] after:bg-ice"
                />
              ))}
            </nav>

            {/* Auth slot — a hamburger menu (Admin / Scorekeeper / Account),
                same row as the brand on every breakpoint. */}
            <div className="flex items-center gap-2 shrink-0">
              {seasons.length > 1 && (
                <HeaderSeasonPicker seasons={seasons} cookieSeasonId={cookieJar.get(SEASON_COOKIE)?.value} />
              )}
              <AuthMenu links={authLinks} />
            </div>
          </div>
        </header>

        <main id="main" className="relative z-[1] flex-1 mx-auto w-full max-w-6xl px-4 sm:px-5 py-6 md:py-10">
          {children}
        </main>

        <footer className="relative z-[1] mt-auto border-t border-rule">
          <div className="mx-auto max-w-6xl px-4 sm:px-5 py-4 sm:py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
            <div className="text-[14px] text-ink-faint">
              <span className="font-semibold text-ink-dim">M.O.T.H Hockey</span>
              <span aria-hidden className="mx-2">/</span>
              {seasonLabel}
            </div>
            <div className="text-[14px] text-ink-faint inline-flex items-center gap-1.5">
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
        <MobileHeaderController />
        <BottomNav authLinks={authLinks} />
        <Toaster richColors position="top-right" theme="dark" />
      </body>
    </html>
  );
}
