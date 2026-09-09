type MicrosoftIconProps = {
  className?: string;
  size?: number;
};

/** Official Microsoft four-square mark — see design/icons/DESIGN.md */
export function MicrosoftIcon({ className, size = 18 }: MicrosoftIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 21 21"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
