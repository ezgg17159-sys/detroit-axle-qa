import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  addMonths,
  buildMonthCells,
  formatRangeLabel,
  isInRange,
  sameDay,
  startOfDay,
  type DateRange,
} from "../lib/dateRange";

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
};

export function DateRangePicker({
  value,
  onChange,
  label = "Date range",
}: DateRangePickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    startOfDay(value.start ?? value.end ?? new Date()),
  );
  const [draft, setDraft] = useState<DateRange>(value);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setViewMonth(startOfDay(value.start ?? value.end ?? new Date()));
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const monthLabel = viewMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const pickDay = (day: Date) => {
    const next = startOfDay(day);

    if (!draft.start || (draft.start && draft.end)) {
      setDraft({ start: next, end: null });
      return;
    }

    if (sameDay(draft.start, next)) {
      const complete = { start: next, end: next };
      setDraft(complete);
      onChange(complete);
      setOpen(false);
      return;
    }

    const complete =
      next.getTime() < draft.start.getTime()
        ? { start: next, end: draft.start }
        : { start: draft.start, end: next };

    setDraft(complete);
    onChange(complete);
    setOpen(false);
  };

  return (
    <div className="date-range" ref={rootRef}>
      <button
        type="button"
        className="date-range__trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        id={id}
        onClick={() => setOpen((prev) => !prev)}
      >
        <CalendarGlyph />
        <span>{formatRangeLabel(value)}</span>
        <ChevronDown />
      </button>

      {open ? (
        <div className="date-range__popover" role="dialog" aria-label={label}>
          <div className="date-range__toolbar">
            <button
              type="button"
              className="date-range__nav"
              aria-label="Previous month"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
            >
              ‹
            </button>
            <p className="date-range__month">{monthLabel}</p>
            <button
              type="button"
              className="date-range__nav"
              aria-label="Next month"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
            >
              ›
            </button>
          </div>

          <div className="date-range__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day} className="date-range__weekday">
                {day}
              </span>
            ))}
          </div>

          <div className="date-range__grid">
            {cells.map((day) => {
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isStart = sameDay(day, draft.start);
              const isEnd = sameDay(day, draft.end);
              const inMiddle = isInRange(day, draft.start, draft.end);
              const single = (isStart && isEnd) || (isStart && !draft.end);

              const className = [
                "date-range__day",
                !inMonth ? "date-range__day--muted" : "",
                isStart ? "date-range__day--start" : "",
                isEnd ? "date-range__day--end" : "",
                inMiddle ? "date-range__day--in-range" : "",
                single ? "date-range__day--single" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={className}
                  onClick={() => pickDay(day)}
                  aria-label={day.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  aria-pressed={isStart || isEnd || inMiddle}
                >
                  <span className="date-range__day-num">{day.getDate()}</span>
                </button>
              );
            })}
          </div>

          <p className="date-range__hint">
            {!draft.start
              ? "Select a start date"
              : !draft.end
                ? "Select an end date"
                : formatRangeLabel(draft)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CalendarGlyph() {
  return (
    <svg
      className="date-range__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg
      className="date-range__chevron"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
