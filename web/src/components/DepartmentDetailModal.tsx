import { useEffect, useId, useRef } from "react";

export type QualityTrend = "up" | "down" | "flat";

export type DepartmentDetails = {
  id: string;
  title: string;
  agents: string;
  avgQuality: string;
  avgQualityTrend: QualityTrend;
  avgQualityVsPrev: string;
  volume: string;
  volumeTrend: QualityTrend;
  volumeVsPrev: string;
  audits: string;
  targetGap: string;
  qualityRange: string;
  topPerformer: string;
};

type DepartmentDetailModalProps = {
  department: DepartmentDetails | null;
  onClose: () => void;
};

function TrendMark({ trend }: { trend: QualityTrend }) {
  if (trend === "up") return <span aria-hidden="true">▲</span>;
  if (trend === "down") return <span aria-hidden="true">▼</span>;
  return <span aria-hidden="true">–</span>;
}

export function DepartmentDetailModal({
  department,
  onClose,
}: DepartmentDetailModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!department) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [department, onClose]);

  if (!department) return null;

  const rows = [
    {
      label: "AVG QUALITY",
      value: (
        <>
          <span className={`dept-modal__trend dept-modal__trend--${department.avgQualityTrend}`}>
            <TrendMark trend={department.avgQualityTrend} />
          </span>
          <span>
            {department.avgQualityVsPrev}% vs prev
          </span>
        </>
      ),
    },
    {
      label: "Volume",
      value: (
        <>
          <span className={`dept-modal__trend dept-modal__trend--${department.volumeTrend}`}>
            <TrendMark trend={department.volumeTrend} />
          </span>
          <span>
            {department.volumeVsPrev}% vs prev
          </span>
        </>
      ),
    },
    {
      label: "Audits",
      value: <span>{department.audits}</span>,
    },
    {
      label: "Vs 90% target",
      value: <span>{department.targetGap}</span>,
    },
    {
      label: "Quality range",
      value: <span>{department.qualityRange}</span>,
    },
  ];

  return (
    <div className="dept-modal" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dept-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dept-modal__header">
          <div>
            <h2 id={titleId} className="dept-modal__title">
              {department.title}
            </h2>
            <p className="dept-modal__subtitle">
              Top Performer ({department.topPerformer})
            </p>
          </div>
          <button
            type="button"
            className="dept-modal__close"
            aria-label="Close details"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="dept-modal__grid">
          {rows.map((row) => (
            <div key={row.label} className="dept-modal__row">
              <p className="dept-modal__label">{row.label}</p>
              <p className="dept-modal__value">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
