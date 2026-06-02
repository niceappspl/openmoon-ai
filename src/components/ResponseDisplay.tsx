import { X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ResponseDisplayProps {
  response: string;
  onClear: () => void;
}

export const ResponseDisplay = ({ response, onClear }: ResponseDisplayProps) => {
  return (
    <div className="mt-3 relative animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="p-3 rounded-lg bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 max-h-[400px] overflow-y-auto backdrop-blur-sm">
        <div className="text-xs text-white/80 prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({node, inline, className, children, ...props}: any) => {
                return inline ? (
                  <code className="bg-white/10 border border-white/20 px-1 py-0.5 rounded text-white/80" {...props}>
                    {children}
                  </code>
                ) : (
                  <code className="block bg-white/10 p-2 rounded my-2 text-xs overflow-x-auto border border-white/10" {...props}>
                    {children}
                  </code>
                );
              },
              pre: ({children}: any) => <div className="my-2">{children}</div>,
              a: ({children, href}: any) => (
                <a href={href} className="text-white/80 hover:text-white underline" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              ul: ({children}: any) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
              ol: ({children}: any) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
              h1: ({children}: any) => <h1 className="text-xs font-medium mt-2 mb-1 text-white/90">{children}</h1>,
              h2: ({children}: any) => <h2 className="text-xs font-medium mt-2 mb-1 text-white/90">{children}</h2>,
              h3: ({children}: any) => <h3 className="text-xs font-medium mt-2 mb-1 text-white/90">{children}</h3>,
              p: ({children}: any) => <p className="my-1">{children}</p>,
            }}
          >
            {response}
          </ReactMarkdown>
        </div>
      </div>
      <button
        onClick={onClear}
        className="absolute top-2 right-2 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-all hover:scale-110 active:scale-95"
        aria-label="Clear response"
      >
        <X className="h-3 w-3 text-white/70" />
      </button>
    </div>
  );
};
