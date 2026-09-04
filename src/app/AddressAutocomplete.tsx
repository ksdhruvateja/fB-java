import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { fetchAddressAutocomplete, type AddressSuggestion } from "./addressApi";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
};

export function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  disabled,
  placeholder = "Start typing your address…",
  required,
  autoComplete = "street-address",
  className = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground",
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reqSeq = useRef(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hint, setHint] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (disabled || q.length < MIN_CHARS) {
      abortRef.current?.abort();
      setSuggestions([]);
      setLoading(false);
      setHint(null);
      setSearched(false);
      setOpen(false);
      return;
    }

    const seq = ++reqSeq.current;
    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setHint(null);
      void fetchAddressAutocomplete(q, { signal: controller.signal, limit: 6 })
        .then((res) => {
          if (seq !== reqSeq.current) return;
          setLoading(false);
          setSearched(true);
          if (res.unavailable) {
            setSuggestions([]);
            setHint(
              res.message ||
                "Address suggestions are temporarily unavailable. You can continue entering the address manually."
            );
            setOpen(true);
            return;
          }
          const list = res.suggestions || [];
          setSuggestions(list);
          if (list.length === 0) {
            setHint("No matching addresses found. Continue entering the address manually.");
          } else {
            setHint(null);
          }
          setOpen(true);
          setActiveIndex(-1);
        })
        .catch((err) => {
          if (err?.name === "AbortError" || seq !== reqSeq.current) return;
          setLoading(false);
          setSearched(true);
          setSuggestions([]);
          setHint(
            "Address suggestions are temporarily unavailable. You can continue entering the address manually."
          );
          setOpen(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, disabled]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function selectSuggestion(s: AddressSuggestion) {
    onSelect(s);
    setOpen(false);
    setActiveIndex(-1);
    setSuggestions([]);
    setHint(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp") && suggestions.length) {
      setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  }

  const showMenu = open && (loading || searched || suggestions.length > 0 || hint);

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (value.trim().length >= MIN_CHARS && (suggestions.length || hint || loading)) {
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
        autoComplete={autoComplete}
        role="combobox"
        aria-expanded={showMenu ? true : false}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
        }
      />
      {showMenu ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
        >
          {loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching addresses…</p>
          ) : null}
          {!loading && suggestions.length > 0 ? (
            <ul className="max-h-52 overflow-y-auto py-1">
              {suggestions.map((s, idx) => (
                <li key={`${s.placeId || s.label}-${idx}`}>
                  <button
                    type="button"
                    id={`${listId}-opt-${idx}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={`w-full px-3 py-2 text-left transition-colors ${
                      idx === activeIndex ? "bg-muted" : "hover:bg-muted/70"
                    }`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {s.primary || s.addressLine1}
                    </span>
                    {s.secondary ? (
                      <span className="block text-xs text-muted-foreground">{s.secondary}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!loading && hint ? (
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
