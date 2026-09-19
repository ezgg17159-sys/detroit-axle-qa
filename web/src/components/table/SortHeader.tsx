export type SortDir = "asc" | "desc";

export function SortHeader({
  label,
  active,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th scope="col" className={className || undefined} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`data-table__sort${active ? ` is-${dir}` : ""}`}
        onClick={onClick}
        aria-label={`Sort by ${label}`}
      >
        <span className="data-table__sort-label">{label}</span>
        <span className="data-table__sort-icons" aria-hidden="true">
          <svg className="is-up" width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M4 0.5L7.5 4.5H0.5L4 0.5Z" fill="currentColor" />
          </svg>
          <svg className="is-down" width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M4 4.5L0.5 0.5H7.5L4 4.5Z" fill="currentColor" />
          </svg>
        </span>
      </button>
    </th>
  );
}
