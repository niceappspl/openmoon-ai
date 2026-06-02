import { Loader2 } from 'lucide-react';

export type SpinnerSize = 'xs' | 'sm' | 'md';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
};

export const Spinner = ({ size = 'sm', className = '' }: SpinnerProps) => (
  <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />
);
