import { RefObject } from 'react';
import { Play } from 'lucide-react';

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
  return (
    <>
      <div className="mt-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`w-full bg-transparent border-none text-white focus:outline-none text-[15px] font-normal resize-none overflow-y-auto disabled:opacity-50 transition-all duration-200 ${placeholderFading ? 'placeholder-white/10' : 'placeholder-white/40'}`}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          rows={1}
          style={{ minHeight: '28px', maxHeight: '84px' }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-[10px] text-white/30">
          {value.trim() && (
            <span>
              ⌘↵ to execute
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || isLoading}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium border transition-all active:scale-[0.98] border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 ${
            !value.trim() || isLoading ? 'opacity-30 cursor-not-allowed' : ''
          }`}
        >
          <Play className={`h-2.5 w-2.5 text-white/70 ${isLoading ? 'animate-pulse' : ''}`} />
          <span className="text-white/70">
            {isLoading ? 'Running...' : 'Run'}
          </span>
        </button>
      </div>
    </>
  );
};
