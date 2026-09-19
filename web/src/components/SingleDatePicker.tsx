import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  addMonths,
  buildMonthCells,
  formatDisplayDate,
  sameDay,
  startOfDay,
} from "../lib/dateRange";

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return startOfDay(new Date(y, m - 1, d));
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type SingleDatePickerProps = {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
};

export function SingleDatePicker({
  label = "Date",
  value,
  onChange,
}: SingleDatePickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    startOfDay(selected ?? new Date()),
  );

  useEffect(() => {
    if (open) {
      setViewMonth(startOfDay(selected ?? new Date()));
    }
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
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
  const today = startOfDay(new Date());

  return (
    <div className="cases-field date-field" ref={rootRef}>
      <span className="cases-field__label" id={id}>
        {label}
      </span>
      <button
        type="button"
        className={`date-field__trigger${open ? " is-open" : ""}`}
        aria-labelledby={id}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`date-field__value${selected ? "" : " is-placeholder"}`}>
          {selected ? formatDisplayDate(selected) : "Select date"}
        </span>
        <svg className="date-field__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="date-range__popover date-field__popover" role="dialog" aria-label={label}>
          <div className="date-range__toolbar">
            <button
              type="button"
              className="date-range__nav"
              aria-label="Previous month"
              onClick={() => setViewMonth((current) => addMonths(current, -1))}
            >
              ‹
            </button>
            <p className="date-range__month">{monthLabel}</p>
            <button
              type="button"
              className="date-range__nav"
              aria-label="Next month"
              onClick={() => setViewMonth((current) => addMonths(current, 1))}
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
              const muted = day.getMonth() !== viewMonth.getMonth();
              const isSelected = sameDay(day, selected);
              const isToday = sameDay(day, today);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={[
                    "date-range__day",
                    "date-range__day--single",
                    muted ? "date-range__day--muted" : "",
                    isSelected ? "date-range__day--end" : "",
                    isToday && !isSelected ? "date-field__day--today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    onChange(toIsoDate(day));
                    setOpen(false);
                  }}
                >
                  <span className="date-range__day-num">{day.getDate()}</span>
                </button>
              );
            })}
          </div>

          <div className="date-field__footer">
            <button
              type="button"
              className="date-field__link"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="date-field__link"
              onClick={() => {
                onChange(toIsoDate(today));
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
