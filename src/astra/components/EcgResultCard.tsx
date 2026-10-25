import React from 'react';
import type { EcgInterpretation } from '../agents/ecgAgent';
import './ecg-card.css';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="ecg-sec">
    <div className="ecg-sec-title">{title}</div>
    {children}
  </div>
);

export const EcgResultCard: React.FC<{ data: EcgInterpretation }> = ({ data }) => (
  <div className="ecg-card">
    <div className="ecg-card-head">
      <span className="ecg-card-title">ECG Interpretation — Astra Vision Agent</span>
      <span className={`ecg-conf ecg-conf-${(data.confidence || 'Moderate').toLowerCase()}`}>
        {data.confidence || 'Moderate'} confidence
      </span>
    </div>

    {data.redFlags && data.redFlags.length > 0 && (
      <div className="ecg-redflags">
        <strong>🚨 RED FLAGS — ACT NOW</strong>
        <ul>
          {data.redFlags.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>
    )}

    <div className="ecg-grid">
      <Section title="Rate">{data.rate}</Section>
      <Section title="Rhythm">{data.rhythm}</Section>
      <Section title="Axis">{data.axis}</Section>
      <Section title="PR / QRS / QTc">
        {data.intervals?.pr || 'N/A'} / {data.intervals?.qrs || 'N/A'} / {data.intervals?.qtc || 'N/A'}
      </Section>
    </div>

    <Section title="Technical quality">{data.technicalQuality}</Section>
    {data.chambers && <Section title="Chambers">{data.chambers}</Section>}
    {data.ischemiaInfarction && <Section title="Ischemia / Infarction">{data.ischemiaInfarction}</Section>}
    {data.localization && <Section title="Localization">{data.localization}</Section>}

    {data.findings && data.findings.length > 0 && (
      <Section title="Findings">
        <ul>
          {data.findings.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </Section>
    )}

    {data.impression && data.impression.length > 0 && (
      <Section title="Impression">
        <ol>
          {data.impression.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ol>
      </Section>
    )}

    {data.differentials && data.differentials.length > 0 && (
      <Section title="Differentials / mimics">
        <ul>
          {data.differentials.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </Section>
    )}

    {data.immediateManagement && data.immediateManagement.length > 0 && (
      <Section title="Immediate management (per ACC/AHA/ESC)">
        <ol>
          {data.immediateManagement.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ol>
      </Section>
    )}

    <div className="ecg-disclaimer">
      {data.disclaimer || 'AI decision support only. Confirm with a 12-lead review and treating physician.'}
    </div>
  </div>
);
