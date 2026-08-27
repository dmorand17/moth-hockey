import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SectionHeader } from "@/components/SectionHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TITLES: Record<string, { title: string; eyebrow: string }> = {
  rules: { title: "Rules", eyebrow: "House rules" },
  faq: { title: "FAQ", eyebrow: "Q & A" },
  league: { title: "About the league", eyebrow: "M.O.T.H" },
};

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
    <div className="space-y-8">
      <Link href="/about" className="rise eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11 -mx-2 px-2">
        ← About
      </Link>
      <div className="rise delay-1">
        <SectionHeader eyebrow={meta.eyebrow} title={meta.title} size="lg" as="h1" />
      </div>

      {(pages ?? []).length === 0 ? (
        <div className="rise delay-2 panel-bare p-6 stripes">
          <div className="eyebrow mb-2 text-goal">Empty net</div>
          <p className="text-ink-dim text-[14px]">
            No content here yet — admin will add this soon.
          </p>
        </div>
      ) : (
        <div className="rise delay-2 space-y-3">
          {(pages ?? []).map((p) => (
            <article key={p.id} className="panel p-6">
              <h2 className="font-display text-[24px] tracking-[0.03em] mb-3">
                {p.title.toUpperCase()}
              </h2>
              <div className="prose-rink text-[14.5px] leading-relaxed text-ink-dim">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {p.body_md}
                </ReactMarkdown>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
