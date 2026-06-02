import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-2 rounded-lg border border-white/10 bg-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/10 bg-white/[0.03]">
        <span className="text-[10px] uppercase tracking-wide text-white/40">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white/90 transition-colors"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '0.75rem',
          background: 'transparent',
          fontSize: '0.7rem',
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};
