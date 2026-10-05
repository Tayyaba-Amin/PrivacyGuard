import type { ReactNode } from 'react';

type StageSectionProps = {
  step: number;
  label: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'done';
  children: ReactNode;
};

export function StageSection({
  step,
  label,
  title,
  description,
  status,
  children,
}: StageSectionProps) {
  const headingId = `stage-${step}-title`;

  return (
    <section className={`stage stage--${status}`} aria-labelledby={headingId}>
      <div className="stage__head">
        <span className="stage__marker" aria-hidden="true">
          {status === 'done' ? '✓' : step}
        </span>
        <div className="stage__headings">
          <p className="stage__label">{label}</p>
          <h2 className="stage__title" id={headingId}>
            {title}
          </h2>
          {description ? <p className="stage__description">{description}</p> : null}
        </div>
        <span className={`stage__state stage__state--${status}`}>{statusLabel(status)}</span>
      </div>
      <div className="stage__body">{children}</div>
    </section>
  );
}

function statusLabel(status: StageSectionProps['status']): string {
  if (status === 'done') return 'Complete';
  if (status === 'active') return 'In progress';
  return 'Not started';
}