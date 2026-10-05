import { MOCK_STAGES } from '../lib/mockAnalysis';

type AnalysisProgressProps = {
  done: number;
  label: string;
};

export function AnalysisProgress({ done, label }: AnalysisProgressProps) {
  return (
    <div className="analysis" aria-live="polite">
      <div className="analysis__row">
        <span className="spinner" aria-hidden="true" />
        <p className="analysis__title">{label}</p>
      </div>

      <ol className="analysis__steps">
        {MOCK_STAGES.map((stage, index) => (
          <li key={stage} className={index < done ? 'analysis__step analysis__step--done' : 'analysis__step'}>
            <span className="analysis__dot" aria-hidden="true" />
            <span>
              {stage}
              {index === done ? '…' : ''}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}