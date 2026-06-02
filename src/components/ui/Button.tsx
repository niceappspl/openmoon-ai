import { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20',
  secondary: 'text-white/80 border border-white/15 bg-white/5 hover:bg-white/10',
  ghost:     'text-white/60 hover:text-white/80 hover:bg-white/5',
  danger:    'text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20',
  success:   'text-green-400 border border-green-500/30 bg-green-500/15 hover:bg-green-500/25',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-[10px]',
  md: 'px-3 py-1.5 text-xs',
  lg: 'px-4 py-2 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded transition-colors disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
