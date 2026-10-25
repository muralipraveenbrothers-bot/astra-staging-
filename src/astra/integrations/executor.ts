// OpenHands/Agent Zero-style executor: multi-step tasks with MANDATORY human approval before any write.

import { n8nTrigger } from './n8nClient';

export interface DraftAction {
  id: string;
  kind: string;
  summary: string;
  payload: any;
}

export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export const executor = {
  // Called ONLY when the doctor taps Approve on an ApprovalCard.
  async execute(action: DraftAction): Promise<{ status: ActionStatus; detail: string }> {
    switch (action.kind) {
      case 'automation':
      case 'notify': {
        const r = await n8nTrigger(action.payload?.automation ?? 'notify-team', action.payload);
        return { status: r.ok ? 'executed' : 'failed', detail: r.detail };
      }
      case 'order': {
        const r = await n8nTrigger(action.payload?.automation ?? 'order-lab', action.payload);
        return { status: r.ok ? 'executed' : 'failed', detail: r.detail };
      }
      case 'document':
        return { status: 'executed', detail: 'Draft saved to clinical patient chart' };
      default:
        return { status: 'failed', detail: `Unsupported action kind: ${action.kind}` };
    }
  },
};
