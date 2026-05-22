import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";

const sections = [
  {
    href: "/about/league",
    eyebrow: "01",
    title: "About the league",
    description: "History, format, and how to get in touch.",
  },
  {
    href: "/about/rules",
    eyebrow: "02",
    title: "Rules",
    description: "Penalty shots, OT, shootout — what's different about M.O.T.H.",
  },
  {
    href: "/about/faq",
    eyebrow: "03",
    title: "FAQ",
    description: "Common questions from players, subs, and spectators.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-10">
      <div className="rise">
        <SectionHeader
          eyebrow="The Beer League"
          title="About M.O.T.H"
          subtitle="Mostly Over The Hill — hockey for the rest of us."
          size="lg"
        />
      </div>

      <div className="rise delay-1 grid gap-3 md:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="panel p-6 hover:border-rule-strong transition-colors group"
          >
            <div className="eyebrow text-goal">{s.eyebrow}</div>
            <h3 className="font-display text-[28px] tracking-[0.04em] leading-tight mt-2">
              {s.title.toUpperCase()}
            </h3>
            <p className="text-[14px] text-ink-dim mt-3 leading-relaxed">{s.description}</p>
            <div className="mt-5 eyebrow group-hover:text-ink transition-colors">Read →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
