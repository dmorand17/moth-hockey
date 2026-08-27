"use client";

import { useId, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; label: string };

type Props = {
  options: ComboOption[];
  /** Form mode: renders a hidden input with this name carrying the value. */
  name?: string;
  /** Controlled mode: current value + change handler. */
  value?: string;
  onChange?: (value: string) => void;
  /** Uncontrolled seed (form mode). */
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Show a ✕ to clear back to "" (e.g. "no captain"). */
  allowClear?: boolean;
  className?: string;
};

const inputCls =
  "w-full bg-board-3 border border-rule rounded px-2 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ice disabled:opacity-50";

/**
 * Type-to-search picker over a list of players (or any {value,label}). Works
 * two ways: controlled (value/onChange) or inside a server-action <form> via
 * `name` (renders a hidden input). Keyboard: ↑/↓ to move, Enter to pick,
 * Esc to close.
 */
export function PlayerCombobox({
  options,
  name,
  value,
  onChange,
  defaultValue = "",
  placeholder = "Search players…",
  disabled = false,
  allowClear = false,
  className = "",
}: Props) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const selected = isControlled ? value : internal;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === selected)?.label ?? "",
    [options, selected],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const commit = (next: string) => {
    if (isControlled) onChange?.(next);
    else {
      setInternal(next);
      onChange?.(next);
    }
  };

  const pick = (opt: ComboOption) => {
    commit(opt.value);
    setQuery("");
    setOpen(false);
  };

  const clear = () => {
    commit("");
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        pick(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={selected} />}

      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
        className={inputCls}
      />

      {allowClear && selected && !disabled && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear selection"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-goal text-[13px] leading-none px-1"
        >
          ✕
        </button>
      )}

      {open && !disabled && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded border border-rule bg-board-2 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-[12px] text-ink-faint">No matches</li>
            ) : (
              filtered.map((opt, i) => (
                <li key={opt.value} role="option" aria-selected={opt.value === selected}>
                  <button
                    type="button"
                    // mousedown fires before the input's blur, so the pick lands.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(opt);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`block w-full text-left px-2 py-2 text-[12px] transition-colors ${
                      i === highlight ? "bg-board-3 text-ink" : "text-ink-dim hover:text-ink"
                    } ${opt.value === selected ? "border-l-2 border-ice" : "border-l-2 border-transparent"}`}
                  >
                    {opt.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
