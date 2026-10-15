import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// User-written markdown. No rehype-raw, so raw HTML is never rendered;
// images are dropped; links open in a new tab and carry no SEO credit.
export function PostBody({ body }: { body: string }) {
  return (
    <div className="prose-rink text-[14.5px] leading-relaxed text-ink-dim break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{
          // prose-rink only styles h2–h4 (the page owns the h1), so shift
          // `#` down a level and fold h5/h6 into h4.
          h1: ({ children }) => <h2>{children}</h2>,
          h5: ({ children }) => <h4>{children}</h4>,
          h6: ({ children }) => <h4>{children}</h4>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
