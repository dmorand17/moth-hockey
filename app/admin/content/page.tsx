import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createContentPage,
  deleteContentPage,
  updateContentPage,
} from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";

type Section = "rules" | "faq" | "league";

const SECTIONS: { key: Section; label: string; eyebrow: string }[] = [
  { key: "league", label: "League", eyebrow: "About M.O.T.H" },
  { key: "rules", label: "Rules", eyebrow: "House rules" },
  { key: "faq", label: "FAQ", eyebrow: "Q & A" },
];

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full";

type ContentRow = {
  id: string;
  section: Section;
  slug: string;
  title: string;
  body_md: string;
  sort_order: number;
};

export default async function AdminContentPage() {
  await requireRole(["admin"]);

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("content_pages")
    .select("id, section, slug, title, body_md, sort_order")
    .order("section")
    .order("sort_order");

  const all = (rows ?? []) as ContentRow[];
  const bySection = new Map<Section, ContentRow[]>();
  for (const s of SECTIONS) bySection.set(s.key, []);
  for (const r of all) bySection.get(r.section)?.push(r);

  return (
    <div className="space-y-8">
      <p className="text-ink-dim text-[13px] leading-relaxed">
        Pages here power <span className="font-mono">/about/league</span>,{" "}
        <span className="font-mono">/about/rules</span>, and{" "}
        <span className="font-mono">/about/faq</span>. Each section can hold
        multiple entries; they render in <em>sort order</em> on the public page.
        Body supports Markdown (headings, lists, links, **bold**).
      </p>

      {SECTIONS.map((section) => {
        const entries = bySection.get(section.key) ?? [];
        return (
          <section key={section.key} className="space-y-3">
            <header className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl tracking-[0.04em] text-ink">
                {section.label.toUpperCase()}
              </h2>
              <Link
                href={`/about/${section.key}`}
                className="eyebrow hover:text-ink transition-colors"
              >
                View public →
              </Link>
            </header>

            {/* Create */}
            <details className="group border border-rule rounded">
              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none hover:bg-board-3 transition-colors rounded">
                <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block">
                  ▶
                </span>
                <span className="font-display text-[13px] tracking-[0.14em] text-ice">
                  + NEW {section.label.toUpperCase()} ENTRY
                </span>
              </summary>
              <div className="border-t border-rule p-4">
                <ActionForm action={createContentPage} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="section" value={section.key} />
                  <div className="flex flex-wrap gap-3">
                    <label className="block flex-1 min-w-[200px]">
                      <span className="eyebrow">Title</span>
                      <input
                        type="text"
                        name="title"
                        required
                        placeholder="Section title"
                        className={`mt-1 ${inputCls}`}
                      />
                    </label>
                    <label className="block w-full sm:w-auto sm:min-w-[160px]">
                      <span className="eyebrow">Slug (optional)</span>
                      <input
                        type="text"
                        name="slug"
                        placeholder="auto from title"
                        className={`mt-1 ${inputCls}`}
                      />
                    </label>
                    <label className="block w-full sm:w-auto sm:min-w-[100px]">
                      <span className="eyebrow">Sort order</span>
                      <input
                        type="number"
                        name="sort_order"
                        defaultValue={
                          entries.length === 0
                            ? 0
                            : Math.max(...entries.map((e) => e.sort_order)) + 10
                        }
                        className={`mt-1 ${inputCls}`}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="eyebrow">Body (markdown)</span>
                    <textarea
                      name="body_md"
                      rows={8}
                      placeholder={"## Overview\n\nWrite content here…"}
                      className={`mt-1 ${inputCls} font-mono text-[13px] leading-relaxed`}
                    />
                  </label>
                  <SubmitButton className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors">
                    CREATE
                  </SubmitButton>
                </ActionForm>
              </div>
            </details>

            {/* Existing entries */}
            {entries.length === 0 ? (
              <p className="text-ink-dim text-[13px] panel-bare p-3">
                No entries yet for {section.label}.
              </p>
            ) : (
              <div className="space-y-1">
                {entries.map((entry) => (
                  <details
                    key={entry.id}
                    className="group border border-rule rounded"
                  >
                    <summary className="flex flex-wrap items-center gap-3 px-3 py-2.5 cursor-pointer list-none select-none hover:bg-board-3 transition-colors rounded">
                      <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                        ▶
                      </span>
                      <span className="font-mono text-[11px] text-ink-faint shrink-0 w-8 text-right">
                        {entry.sort_order}
                      </span>
                      <span className="font-display text-[14px] tracking-[0.04em] text-ink flex-1 min-w-[160px]">
                        {entry.title.toUpperCase()}
                      </span>
                      <span className="font-mono text-[11px] text-ink-faint">
                        /{entry.slug}
                      </span>
                    </summary>

                    <div className="border-t border-rule p-4 space-y-3">
                      <ActionForm action={updateContentPage} className="space-y-3">
                        <input type="hidden" name="id" value={entry.id} />
                        <input
                          type="hidden"
                          name="section"
                          value={entry.section}
                        />
                        <div className="flex flex-wrap gap-3">
                          <label className="block flex-1 min-w-[200px]">
                            <span className="eyebrow">Title</span>
                            <input
                              type="text"
                              name="title"
                              required
                              defaultValue={entry.title}
                              className={`mt-1 ${inputCls}`}
                            />
                          </label>
                          <label className="block w-full sm:w-auto sm:min-w-[160px]">
                            <span className="eyebrow">Slug</span>
                            <input
                              type="text"
                              name="slug"
                              defaultValue={entry.slug}
                              className={`mt-1 ${inputCls}`}
                            />
                          </label>
                          <label className="block w-full sm:w-auto sm:min-w-[100px]">
                            <span className="eyebrow">Sort order</span>
                            <input
                              type="number"
                              name="sort_order"
                              defaultValue={entry.sort_order}
                              className={`mt-1 ${inputCls}`}
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="eyebrow">Body (markdown)</span>
                          <textarea
                            name="body_md"
                            rows={10}
                            defaultValue={entry.body_md}
                            className={`mt-1 ${inputCls} font-mono text-[13px] leading-relaxed`}
                          />
                        </label>
                        <div className="flex items-center gap-3">
                          <SubmitButton className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors">
                            SAVE
                          </SubmitButton>
                        </div>
                      </ActionForm>

                      <ActionForm
                        action={deleteContentPage}
                        className="border-t border-rule/50 pt-3"
                      >
                        <input type="hidden" name="id" value={entry.id} />
                        <input
                          type="hidden"
                          name="section"
                          value={entry.section}
                        />
                        <SubmitButton className="text-goal/60 hover:text-goal font-display tracking-[0.1em] text-[12px] transition-colors">
                          DELETE ENTRY
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
