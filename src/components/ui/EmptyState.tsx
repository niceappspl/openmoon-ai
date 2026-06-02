import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState = ({ icon: Icon, message, action, className = '' }: EmptyStateProps) => (
  <div className={`flex flex-col items-center gap-2 py-6 text-center ${className}`}>
    {Icon && <Icon className="h-5 w-5 text-white/20" />}
    <p className="text-[11px] text-white/40">{message}</p>
    {action && <div className="mt-1">{action}</div>}
  </div>
);
