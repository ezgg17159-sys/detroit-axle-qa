type SelectAllCheckboxProps = {
  allSelected: boolean;
  someSelected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label?: string;
};

function checkClass(opts: {
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
}) {
  return [
    "data-table__check",
    opts.checked ? "is-checked" : "",
    opts.indeterminate ? "is-indeterminate" : "",
    opts.disabled ? "is-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

type TableCheckProps = {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
};

export function TableCheck({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  label,
}: TableCheckProps) {
  return (
    <label className={checkClass({ checked, indeterminate, disabled })}>
      <input
        type="checkbox"
        className="data-table__check-input"
        checked={checked}
        ref={(node) => {
          if (node) node.indeterminate = indeterminate;
        }}
        onChange={onChange}
        aria-label={label}
        disabled={disabled}
      />
      <span className="data-table__check-box" aria-hidden="true" />
    </label>
  );
}

export function SelectAllCheckbox({
  allSelected,
  someSelected,
  disabled = false,
  onToggle,
  label = "Select all on this page",
}: SelectAllCheckboxProps) {
  return (
    <th scope="col" className="data-table__check-col">
      <span className="data-table__th-static data-table__check-wrap">
        <TableCheck
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          disabled={disabled}
          onChange={onToggle}
          label={label}
        />
      </span>
    </th>
  );
}

type RowCheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  label: string;
  stopRowClick?: boolean;
};

export function RowCheckboxCell({
  checked,
  onToggle,
  label,
  stopRowClick = true,
}: RowCheckboxProps) {
  return (
    <td
      className="data-table__check-col"
      onClick={stopRowClick ? (event) => event.stopPropagation() : undefined}
      onKeyDown={stopRowClick ? (event) => event.stopPropagation() : undefined}
    >
      <span className="data-table__check-wrap">
        <TableCheck checked={checked} onChange={onToggle} label={label} />
      </span>
    </td>
  );
}

type BulkDeleteButtonProps = {
  count: number;
  onClick: () => void;
  noun?: string;
};

export function BulkDeleteButton({ count, onClick, noun = "selected" }: BulkDeleteButtonProps) {
  if (count <= 0) return null;
  return (
    <div className="data-table-bulk">
      <span className="data-table-bulk__label" aria-hidden="true">
        Delete
      </span>
      <button type="button" className="data-table-bulk__delete" onClick={onClick}>
        Delete ({count})
        <span className="visually-hidden"> {noun}</span>
      </button>
    </div>
  );
}
