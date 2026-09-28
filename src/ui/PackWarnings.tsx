export interface PartWarningLine {
  partId: string;
  text: string;
}

export type WarningLine = PartWarningLine | { text: string };

export function PackWarningList({ lines }: { lines: WarningLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="pack-warnings" role="status">
      {lines.map((line, index) => (
        <li key={index}>
          {"partId" in line ? (
            <>
              <bdi dir="ltr">{line.partId}</bdi>
              {": "}
              {line.text}
            </>
          ) : (
            line.text
          )}
        </li>
      ))}
    </ul>
  );
}
