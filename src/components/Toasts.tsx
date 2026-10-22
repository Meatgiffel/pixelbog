import { Icon } from "../lib/pixel";
import { useStore } from "../state/store";
import { dismissToast, ui } from "../state/ui";

export function Toasts() {
  const toasts = useStore(ui, (s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={"toast" + (t.leaving ? " is-leaving" : "")}>
          <Icon name={t.icon} />
          <div className="toast-text">
            <strong className="toast-title">{t.title}</strong>
            <span className="toast-msg">{t.msg}</span>
            {t.action ? (
              <span>
                <button type="button" className="btn btn-s" onClick={() => { dismissToast(t.id); t.onAction?.(); }}>{t.action}</button>
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
