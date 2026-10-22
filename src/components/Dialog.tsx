/* RPG-tekstbokse: én <dialog> til hele appen, indhold fra state/ui.ts */
import { Fragment, type ReactNode, useEffect, useRef } from "react";
import { useTypewriter } from "../lib/pixel";
import { motionOff, settings } from "../state/settings";
import { useStore } from "../state/store";
import { closeDialog, openDialog, ui } from "../state/ui";

export interface Choice {
  label: string;
  hint?: string;
  danger?: boolean;
  run: () => void;
}

interface BoxProps {
  speaker?: string;
  text: string;
  children?: ReactNode;
  choices?: Choice[];
  actions?: ReactNode;
  /** CSS-selektor for elementet, der får fokus */
  focus?: string;
}

export function RpgBox({ speaker, text, children, choices, actions, focus }: BoxProps) {
  useStore(settings, (s) => s.motion);
  const still = motionOff();
  const [shown, typing, finish] = useTypewriter(text, still);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    const el = root?.querySelector<HTMLElement>(focus || "[data-choice], .btn");
    el?.focus();
    // fokus kun når teksten (dvs. trinnet) skifter
  }, [text]);

  return (
    <div className="rpg-inner" ref={ref}>
      {speaker ? <span className="rpg-speaker">{speaker}</span> : null}
      {still ? (
        <p className="rpg-text" id="dlg-text">{text}</p>
      ) : (
        <p className="rpg-text" id="dlg-text" aria-label={text} onClick={finish}>
          <span aria-hidden="true">{shown}</span>
          {typing ? <span className="caret blink" aria-hidden="true" /> : null}
        </p>
      )}
      {children ? <div className="rpg-body">{children}</div> : null}
      {choices?.length ? (
        <div className="choices" role="group" aria-label="Valg">
          {choices.map((c, i) => (
            <button key={c.label} type="button" className={"choice" + (c.danger ? " choice-danger" : "")} data-choice={i} onClick={c.run}>
              {c.label}
              {c.hint ? <span className="choice-hint">{c.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {actions ? <div className="rpg-actions">{actions}</div> : null}
    </div>
  );
}

export function DialogHost() {
  const spec = useStore(ui, (s) => s.dialog);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (spec && !el.open) el.showModal();
    if (!spec && el.open) el.close();
  }, [spec]);

  return (
    <dialog
      className="rpg"
      ref={ref}
      aria-labelledby="dlg-text"
      onCancel={(e) => {
        e.preventDefault();
        const keep = spec?.onCancel?.() === false;
        if (!keep && !spec?.preventCancel) closeDialog();
      }}
    >
      {spec ? <Fragment key={spec.id}>{spec.content}</Fragment> : null}
    </dialog>
  );
}

/** "Du har ændringer, der ikke er gemt" — JA kalder onYes. */
export function confirmDiscard(onYes: () => void) {
  openDialog(
    <RpgBox
      speaker="Advarsel"
      text="Du har ændringer, der ikke er gemt. Vil du kassere dem?"
      focus='[data-choice="1"]'
      choices={[
        { label: "JA", hint: "Kassér ændringerne", danger: true, run: () => { closeDialog(); onYes(); } },
        { label: "NEJ", hint: "Fortsæt redigeringen", run: closeDialog },
      ]}
    />,
  );
}
