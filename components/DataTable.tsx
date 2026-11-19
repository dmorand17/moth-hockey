import type { ReactNode } from "react";

// Shared table shell: panel frame, zebra rows, hover, tabular numbers, and a
// header that sticks under the site header. `scroll` adds a horizontal scroll
// wrapper for wide tables (overflow disables sticky, so the header then
// scrolls with the page). Children are the <thead>/<tbody>/<tfoot>; numeric
// cells use `text-right` (sortable headers: see StatsTables).
export function DataTable({
  caption,
  children,
  scroll = false,
  dense = true,
  framed = true,
  className = "",
}: {
  caption: string;
  children: ReactNode;
  scroll?: boolean;
  dense?: boolean;
  /** Draw the panel border (off when nested inside another panel). */
  framed?: boolean;
  className?: string;
}) {
  const table = (
    <table className={`board-table striped ${dense ? "dense" : ""} ${scroll ? "" : "sticky-head"}`}>
      <caption className="sr-only">{caption}</caption>
      {children}
    </table>
  );
  const body = scroll ? <div className="table-scroll">{table}</div> : table;
  return <div className={`${framed ? "panel" : ""} overflow-clip ${className}`}>{body}</div>;
}
