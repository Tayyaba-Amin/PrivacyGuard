import type { ReactNode } from 'react';

type TechnicalDetailsProps = {
  children: ReactNode;
  label?: string;
};

/**
 * Secondary information that is useful for debugging but should not compete
 * with the answer a normal user came for: confidence values, source locations,
 * detector wording and score breakdowns all live behind this disclosure.
 */
export function TechnicalDetails({ children, label = 'Technical details' }: TechnicalDetailsProps) {
  return (
    <details className="technical">
      <summary className="technical__summary">{label}</summary>
      <div className="technical__body">{children}</div>
    </details>
  );
}