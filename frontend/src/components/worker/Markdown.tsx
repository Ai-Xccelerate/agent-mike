"use client";

import ReactMarkdown from "react-markdown";

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        components={{
          p: (props) => <p className="mb-2" {...props} />,
          ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li className="pl-0.5" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          em: (props) => <em className="italic" {...props} />,
          h1: (props) => <h3 className="mb-1.5 mt-2 font-semibold" {...props} />,
          h2: (props) => <h3 className="mb-1.5 mt-2 font-semibold" {...props} />,
          h3: (props) => <h3 className="mb-1.5 mt-2 font-semibold" {...props} />,
          a: (props) => <a className="font-medium underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
          code: (props) => <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10" {...props} />,
          blockquote: (props) => <blockquote className="my-2 border-l-2 border-current/20 pl-3 opacity-90" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
