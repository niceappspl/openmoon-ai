import { ShieldAlert, Check, X } from 'lucide-react';

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

const RISK_STYLES: Record<string, string> = {
  high: 'text-red-400 bg-red-500/15 border-red-500/30',
  medium: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
  low: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  unknown: 'text-white/60 bg-white/10 border-white/20',
};

export const ApprovalCard = ({ request, onDecision }: ApprovalCardProps) => {
  const riskClass = RISK_STYLES[request.risk] ?? RISK_STYLES.unknown;
  const argsText = JSON.stringify(request.args ?? {}, null, 2);

  return (
    <div className="mt-3 rounded-lg bg-black/60 border border-yellow-500/30 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-yellow-400" />
          <span className="text-xs font-medium text-white/90">Approval required</span>
        </div>
        <span className={`px-1.5 py-0.5 text-[10px] rounded border ${riskClass}`}>
          {request.risk} risk
        </span>
      </div>

      <p className="text-xs text-white/70 mb-1">
        Run <span className="font-medium text-white/90">{request.tool}</span>?
      </p>
      <pre className="text-[10px] text-white/50 bg-white/5 rounded p-2 border border-white/10 overflow-x-auto max-h-28">
        {argsText}
      </pre>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onDecision(request.id, true)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-xs bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors"
        >
          <Check className="h-3 w-3" />
          Approve
        </button>
        <button
          onClick={() => onDecision(request.id, false)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-xs bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors"
        >
          <X className="h-3 w-3" />
          Reject
        </button>
      </div>
    </div>
  );
};
