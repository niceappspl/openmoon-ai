import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export type StatusType = 'success' | 'error' | 'warn';

export interface StatusMessageProps {
  type: StatusType;
  message: string;
  className?: string;
}

const CONFIG: Record<StatusType, { classes: string; icon: typeof CheckCircle }> = {
  success: { classes: 'border-green-500/20 bg-green-500/10 text-green-400', icon: CheckCircle },
  error:   { classes: 'border-red-500/20 bg-red-500/10 text-red-400',       icon: XCircle },
  warn:    { classes: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400', icon: AlertTriangle },
};

export const StatusMessage = ({ type, message, className = '' }: StatusMessageProps) => {
  const { classes, icon: Icon } = CONFIG[type];
  return (
    <div className={`flex items-start gap-2 rounded p-2 border text-[11px] leading-relaxed ${classes} ${className}`}>
      <Icon className="h-3 w-3 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
};
