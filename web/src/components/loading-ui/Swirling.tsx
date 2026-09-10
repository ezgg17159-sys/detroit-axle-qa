import type { ComponentProps } from "react";

type SwirlingProps = ComponentProps<"svg">;

export function Swirling({ className, ...props }: SwirlingProps) {
  return (
    <svg
      viewBox="0 0 800 800"
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `swirling ${className}` : "swirling"}
      aria-hidden="true"
      {...props}
    >
      <circle
        className="swirling__circle"
        cx="400"
        cy="400"
        r="200"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="50"
      />
    </svg>
  );
}
