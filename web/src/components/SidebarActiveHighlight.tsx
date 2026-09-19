import { useLayoutEffect, useState, type RefObject } from "react";
import { useLocation } from "react-router-dom";

type HighlightBox = {
  top: number;
  height: number;
  ready: boolean;
};

export function SidebarActiveHighlight({
  navRef,
  sidebarOpen,
}: {
  navRef: RefObject<HTMLElement | null>;
  sidebarOpen: boolean;
}) {
  const location = useLocation();
  const [box, setBox] = useState<HighlightBox>({
    top: 0,
    height: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const measure = () => {
      const active = nav.querySelector<HTMLElement>(".sidebar__link--active");
      if (!active) {
        setBox((current) => ({ ...current, ready: false }));
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      setBox({
        top: activeRect.top - navRect.top + nav.scrollTop,
        height: activeRect.height,
        ready: true,
      });
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [location.pathname, sidebarOpen, navRef]);

  return (
    <div
      className={
        box.ready
          ? "sidebar__highlight sidebar__highlight--ready"
          : "sidebar__highlight"
      }
      aria-hidden="true"
      style={{
        transform: `translateY(${box.top}px)`,
        height: box.height,
      }}
    />
  );
}
