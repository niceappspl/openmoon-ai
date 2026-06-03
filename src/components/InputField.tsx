import { RefObject } from 'react';
import { Play, Loader2 } from 'lucide-react';

interface InputFieldProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled: boolean;
  placeholder: string;
  placeholderFading?: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  isLoading: boolean;
}

export const InputField = ({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  disabled,
  placeholder,
  placeholderFading = false,
  textareaRef,
  isLoading
}: InputFieldProps) => {
  const hasText = value.trim().length > 0;

  return (
    <>
      <div className="mt-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`w-full bg-transparent border-none text-white/95 focus:outline-none text-[16px] font-light tracking-[-0.015em] leading-relaxed resize-none overflow-y-auto disabled:opacity-40 transition-opacity duration-200 caret-orange-400 ${
            placeholderFading ? 'placeholder-white/10' : 'placeholder-white/25'
          }`}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          rows={1}
          style={{ minHeight: '28px', maxHeight: '96px' }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
        <span className={`text-[10px] tracking-widest transition-opacity duration-150 ${hasText ? 'text-white/20 opacity-100' : 'opacity-0'}`}>
          ⌘ ↵
        </span>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!hasText || isLoading}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium border transition-all duration-200 active:scale-[0.97] ${
            hasText && !isLoading
              ? 'border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 hover:border-orange-500/60'
              : 'border-white/8 bg-transparent text-white/25 cursor-not-allowed'
          }`}
        >
          {isLoading
            ? <Loader2 className="h-2.5 w-2.5 animate-spin text-orange-400" />
            : <Play className={`h-2.5 w-2.5 ${hasText ? 'text-orange-400' : 'text-white/25'}`} />
          }
          <span>{isLoading ? 'Running…' : 'Run'}</span>
        </button>
      </div>
    </>
  );
};
