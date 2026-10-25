import React, { useState } from 'react';
import { executor, DraftAction, ActionStatus } from '../integrations/executor';

export const ApprovalCard: React.FC<{ action: DraftAction }> = ({ action }) => {
  const [status, setStatus] = useState<ActionStatus>('pending');
  const [detail, setDetail] = useState('');

  const approve = async () => {
    setStatus('approved');
    const r = await executor.execute(action);
    setStatus(r.status);
    setDetail(r.detail);
  };

  return (
    <div
      style={{
        border: '1px solid #f0c36d',
        background: '#fffaf0',
        borderRadius: 10,
        padding: '10px 12px',
        marginTop: 8,
        fontSize: 13,
        color: '#2d3748',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ fontWeight: 700, color: '#8a5a00', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>⚡ Proposed Action — Requires Doctor Sign-off</span>
      </div>
      <div style={{ margin: '6px 0', fontWeight: 600, color: '#1a202c' }}>{action.summary}</div>
      <div style={{ fontSize: 11, color: '#718096' }}>Category: {action.kind?.toUpperCase()}</div>
      {status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={approve}
            style={{
              background: '#1b7f3b',
              color: '#fff',
              border: 0,
              borderRadius: 6,
              padding: '5px 14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Approve & Execute
          </button>
          <button
            onClick={() => setStatus('rejected')}
            style={{
              background: '#edf2f7',
              color: '#4a5568',
              border: '1px solid #cbd5e0',
              borderRadius: 6,
              padding: '5px 14px',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Reject
          </button>
        </div>
      )}
      {status !== 'pending' && (
        <div style={{ marginTop: 6, fontSize: 12, color: status === 'executed' ? '#276749' : '#c53030' }}>
          Status: <b>{status.toUpperCase()}</b> {detail && `— ${detail}`}
        </div>
      )}
    </div>
  );
};
