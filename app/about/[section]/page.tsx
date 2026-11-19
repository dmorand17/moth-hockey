import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TITLES: Record<string, { title: string; eyebrow: string }> = {
  rules: { title: "Rules", eyebrow: "House rules" },
  faq: { title: "FAQ", eyebrow: "Q & A" },
  league: { title: "About the league", eyebrow: "M.O.T.H" },
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  const meta = TITLES[section];
  return meta ? { title: meta.title, description: `M.O.T.H hockey league — ${meta.title}.` } : {};
}

export default async function AboutSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!(section in TITLES)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: pages } = await supabase
    .from("content_pages")
    .select("id, title, body_md, sort_order")
    .eq("section", section as "rules" | "faq" | "league")
    .order("sort_order");

  const meta = TITLES[section];

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="rise">
        <Link
          href="/about"
          className="text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11"
        >
          <span aria-hidden className="mr-1">←</span> About
        </Link>
        <div className="mt-2">
          <SectionHeader eyebrow={meta.eyebrow} title={meta.title} size="lg" as="h1" />
        </div>
      </div>

      {(pages ?? []).length === 0 ? (
        <div className="rise delay-1">
          <EmptyState title="Nothing here yet">An admin will add this soon.</EmptyState>
        </div>
      ) : (
        <div className="rise delay-1 divide-y divide-rule">
          {(pages ?? []).map((p) => (
            <article key={p.id} className="py-6 first:pt-0">
              <h2 className="text-[22px] md:text-[24px] font-bold leading-8 text-ink mb-3">{p.title}</h2>
              <div className="prose-rink text-[16px] md:text-[17px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body_md}</ReactMarkdown>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
