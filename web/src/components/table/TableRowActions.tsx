import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type TableRowActionItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
};

type MenuCoords = {
  top: number;
  left: number;
  placement: "down" | "up";
};

const GAP = 6;
const VIEWPORT_PAD = 8;
const ITEM_ESTIMATE = 40;
const MENU_CHROME = 14;

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function estimateMenuHeight(itemCount: number) {
  return MENU_CHROME + Math.max(1, itemCount) * ITEM_ESTIMATE;
}

function placeMenu(
  trigger: HTMLElement,
  menuHeight: number,
  menuWidth: number,
): MenuCoords {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
  const spaceAbove = rect.top - VIEWPORT_PAD;
  const need = menuHeight + GAP;

  let placement: "down" | "up" = "down";
  if (spaceBelow < need && spaceAbove > spaceBelow) {
    placement = "up";
  }

  let top =
    placement === "down" ? rect.bottom + GAP : rect.top - GAP - menuHeight;
  let left = rect.right - menuWidth;

  top = Math.max(
    VIEWPORT_PAD,
    Math.min(top, window.innerHeight - menuHeight - VIEWPORT_PAD),
  );
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, window.innerWidth - menuWidth - VIEWPORT_PAD),
  );

  return { top, left, placement };
}

/**
 * Table ⋯ menu that stays visible: scrolls the row up when near the bottom of
 * a scroll container, then opens down or up based on remaining space.
 */
export function TableRowActions({
  label,
  items,
}: {
  label: string;
  items: TableRowActionItem[];
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.filter((item) => !item.hidden);

  const close = useCallback(() => setOpen(false), []);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const menuHeight =
      menuRef.current?.offsetHeight || estimateMenuHeight(visibleItems.length);
    const menuWidth = menuRef.current?.offsetWidth || 160;
    const need = menuHeight + GAP + VIEWPORT_PAD;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;

    // Push the row up inside the table scroller when the menu would clip below.
    if (spaceBelow < need) {
      const scroller = findScrollParent(trigger);
      if (scroller) {
        const scrollerRect = scroller.getBoundingClientRect();
        const roomInScroller = scrollerRect.bottom - rect.bottom - VIEWPORT_PAD;
        const deficit = need - Math.max(0, roomInScroller);
        if (deficit > 0) {
          scroller.scrollTop += deficit;
        }
      }
    }

    setCoords(
      placeMenu(
        trigger,
        menuRef.current?.offsetHeight || menuHeight,
        menuRef.current?.offsetWidth || menuWidth,
      ),
    );
  }, [visibleItems.length]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    reposition();
  }, [open, reposition, visibleItems.length]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onReposition = () => reposition();

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, close, reposition]);

  return (
    <div className="cases-row-actions" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`cases-row-actions__trigger${open ? " is-open" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ⋯
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className={`cases-row-actions__menu cases-row-actions__menu--fixed${coords ? ` is-${coords.placement}` : " is-measuring"}`}
              role="menu"
              style={
                coords
                  ? { top: coords.top, left: coords.left }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
            >
              {visibleItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`cases-row-actions__item${item.danger ? " cases-row-actions__item--danger" : ""}`}
                  onClick={() => {
                    close();
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
