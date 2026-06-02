export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = ({ className = '', children, ...props }: CardProps) => (
  <div
    className={`bg-white/5 border border-white/10 rounded-lg p-3 ${className}`}
    {...props}
  >
    {children}
  </div>
);
