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
