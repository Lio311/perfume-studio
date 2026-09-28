import { useId, type ChangeEvent } from "react";
import { clampLabelText } from "../geometry/logos.ts";

/** Overlay copy is shown only while the brand field has no characters. */
export function brandHintText(value: string, hint: string): string {
  return value.length === 0 ? hint : "";
}

/** First sentence sits on one line inside the field. The rest is the explanation below. */
export function brandHintParts(hint: string): { line: string; more: string } {
  const splitAt = hint.indexOf(". ");
  if (splitAt === -1) return { line: hint, more: "" };
  return { line: hint.slice(0, splitAt), more: hint.slice(splitAt + 2) };
}

/** Typing reveals the label. Clearing keeps whatever visibility the design already had. */
export function labelVisibleAfterTextChange(text: string, currentVisible: boolean): boolean {
  return text.length > 0 ? true : currentVisible;
}

export function BrandTextField({
  value,
  hint,
  labelId,
  onChange,
}: {
  value: string;
  hint: string;
  labelId: string;
  onChange: (value: string) => void;
}) {
  const hintId = useId();
  const { line, more } = brandHintParts(hint);
  const overlay = brandHintText(value, line);
  return (
    <>
      <div className="brand-field">
        <input
          className="search"
          value={value}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(clampLabelText(event.target.value))}
        />
        {overlay ? <span className="brand-hint" aria-hidden="true">{overlay}</span> : null}
        <span id={hintId} className="brand-hint-sr">{hint}</span>
      </div>
      {more ? <p className="hint brand-hint-more" aria-hidden="true">{more}</p> : null}
    </>
  );
}
