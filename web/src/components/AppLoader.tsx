import { Swirling } from "./loading-ui/Swirling";

type AppLoaderProps = {
  label?: string;
  variant?: "splash" | "page" | "inline" | "button";
  className?: string;
};

export function AppLoader({
  label = "Loading",
  variant = "page",
  className,
}: AppLoaderProps) {
  const rootClass = ["app-loader", `app-loader--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} role="status" aria-live="polite" aria-busy="true">
      <Swirling className={`app-loader__swirl app-loader__swirl--${variant}`} />
      {label ? <p className="app-loader__label">{label}</p> : null}
    </div>
  );
}
