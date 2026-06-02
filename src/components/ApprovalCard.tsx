import { ShieldAlert, Check, X } from 'lucide-react';
import { Button, Badge } from './ui';
import type { BadgeVariant } from './ui';

export interface ApprovalRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  risk: string;
}

interface ApprovalCardProps {
  request: ApprovalRequest;
  onDecision: (id: string, approved: boolean) => void;
}

const RISK_TO_BADGE_VARIANT: Record<string, BadgeVariant> = {
  high: 'danger',
  medium: 'warn',
  low: 'neutral',
  unknown: 'neutral',
};

export const ApprovalCard = ({ request, onDecision }: ApprovalCardProps) => {
  const riskVariant = RISK_TO_BADGE_VARIANT[request.risk] ?? 'neutral';
  const argsText = JSON.stringify(request.args ?? {}, null, 2);

  return (
    <div className="mt-3 rounded-lg bg-black/60 border border-yellow-500/30 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-yellow-400" />
          <span className="text-xs font-medium text-white/90">Approval required</span>
        </div>
        <Badge variant={riskVariant}>{request.risk} risk</Badge>
      </div>

      <p className="text-xs text-white/70 mb-1">
        Run <span className="font-medium text-white/90">{request.tool}</span>?
      </p>
      <pre className="text-[10px] text-white/50 bg-white/5 rounded p-2 border border-white/10 overflow-x-auto max-h-28">
        {argsText}
      </pre>

      <div className="flex gap-2 mt-3">
        <Button variant="success" size="md" className="flex-1" onClick={() => onDecision(request.id, true)}>
          <Check className="h-3 w-3" />
          Approve
        </Button>
        <Button variant="danger" size="md" className="flex-1" onClick={() => onDecision(request.id, false)}>
          <X className="h-3 w-3" />
          Reject
        </Button>
      </div>
    </div>
  );
};
