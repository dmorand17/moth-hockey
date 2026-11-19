import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/SectionHeader";

export const metadata: Metadata = {
  title: "About",
  description: "About the Mostly Over The Hill hockey league: history, rules and FAQ.",
};

const icon = (path: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="h-6 w-6"
  >
    {path}
  </svg>
);

const sections = [
  {
    href: "/about/league",
    title: "About the league",
    description: "History, format, and how to get in touch.",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>,
    ),
  },
  {
    href: "/about/rules",
    title: "Rules",
    description: "Penalty shots, OT, shootout — what's different about M.O.T.H.",
    icon: icon(
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" />
      </>,
    ),
  },
  {
    href: "/about/faq",
    title: "FAQ",
    description: "Common questions from players, subs, and spectators.",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
      </>,
    ),
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow="The M.O.T.H league"
          title="About M.O.T.H"
          subtitle="Mostly Over The Hill — hockey for the rest of us."
          size="lg"
          as="h1"
        />
      </div>

      <ul className="rise delay-1 grid gap-3 md:grid-cols-3">
        {sections.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="panel h-full p-4 md:p-6 flex items-start gap-4 hover:bg-board-hover hover:border-rule-strong transition-colors group"
            >
              <span className="shrink-0 h-11 w-11 rounded-md bg-board-3 border border-rule flex items-center justify-center text-ice">
                {s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <h2 className="text-[18px] font-bold leading-6 text-ink group-hover:text-ice transition-colors">
                  {s.title}
                </h2>
                <p className="mt-1 text-[14px] leading-5 text-ink-faint">{s.description}</p>
              </span>
              <span aria-hidden className="self-center text-[18px] text-ink-faint group-hover:text-ice transition-colors">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
