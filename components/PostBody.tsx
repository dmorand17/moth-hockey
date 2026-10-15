import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// User-written markdown. No rehype-raw, so raw HTML is never rendered;
// images are dropped; links open in a new tab and carry no SEO credit.
// Headings render as h3–h4 so posts never compete with the page's own headings.
export function PostBody({ body }: { body: string }) {
  return (
    <div className="prose-post">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{
          h1: ({ children }) => <h3 className="post-h1">{children}</h3>,
          h2: ({ children }) => <h3 className="post-h2">{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
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
