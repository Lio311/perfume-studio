import type { ChangeEvent } from "react";

/** Hint copy is shown only while the brand field has no characters. */
export function brandHintText(value: string, hint: string): string {
  return value.length === 0 ? hint : "";
}

export function BrandTextField({
  value,
  hint,
  label,
  onChange,
}: {
  value: string;
  hint: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const shown = brandHintText(value, hint);
  return (
    <div className="brand-field">
      <input
        className="search"
        value={value}
        aria-label={label}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value.slice(0, 32))}
      />
      {shown ? <span className="brand-hint" aria-hidden="true">{shown}</span> : null}
    </div>
  );
}
