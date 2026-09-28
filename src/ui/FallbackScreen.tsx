import { Component, type ReactNode } from "react";
import { useLab } from "../store/labStore.ts";

export function FallbackScreen({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="boot-fallback" dir="rtl" lang="he" role="alert">
      <div className="boot-fallback-card">
        <h1>{title}</h1>
        <p>{body}</p>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function WebglFallback() {
  return (
    <FallbackScreen
      title="התצוגה התלת־ממדית לא זמינה"
      body="הדפדפן לא הצליח להפעיל את WebGL, או שהמנוע הגרפי נעצר. נסו לרענן את העמוד, לעדכן את הדפדפן, או להפעיל האצת חומרה."
    />
  );
}

interface BoundaryState {
  failed: boolean;
}

/** Catches a render error anywhere in the lab and offers a reset back to the default bottle. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  reset = () => {
    const keep = `${location.pathname}${location.search}`;
    history.replaceState(null, "", keep);
    const lab = useLab.getState();
    lab.newDesign();
    useLab.setState({
      present: false,
      palette: false,
      help: false,
      solo: null,
      aimed: false,
      selected: null,
      stage: "bottle",
      mode: "assemble",
      explode: 0,
    });
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <FallbackScreen
          title="לא הצלחנו להציג את המעבדה"
          body="אירעה שגיאה בטעינת העיצוב. אפשר לאפס ולחזור לבקבוק ההתחלתי."
          actionLabel="איפוס"
          onAction={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

/** Catches a throw from the canvas or the renderer and shows the WebGL message. */
export class WebglBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) return <WebglFallback />;
    return this.props.children;
  }
}
