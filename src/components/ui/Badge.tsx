export type BadgeVariant = 'neutral' | 'success' | 'warn' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'text-white/50 bg-white/10 border-white/20',
  success: 'text-green-400 bg-green-500/10 border-green-500/20',
  warn:    'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  danger:  'text-red-400 bg-red-500/20 border-red-500/30',
};

export const Badge = ({ variant = 'neutral', className = '', children, ...props }: BadgeProps) => (
  <span
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${variantClasses[variant]} ${className}`}
    {...props}
  >
    {children}
  </span>
);
