/* Titelskærm / login */
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../lib/pixel";
import { SERVER, app, login } from "../state/app";
import { play } from "../state/settings";
import { useStore } from "../state/store";

export function Login() {
  const error = useStore(app, (s) => s.loginError);
  const [user, setUser] = useState(() => app.get().user);
  const [busy, setBusy] = useState(false);
  const [fe, setFe] = useState<{ user?: boolean; pass?: boolean }>({});
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const target = error === "auth" || fe.pass ? passRef : fe.user || !user ? userRef : passRef;
    target.current?.focus();
    // fokus flyttes kun ved en ny fejl, ikke ved hvert tastetryk
  }, [error, fe]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const u = (form.elements.namedItem("username") as HTMLInputElement).value.trim();
    const p = (form.elements.namedItem("password") as HTMLInputElement).value;
    setUser(u);
    setFe({ user: !u, pass: !p });
    app.set({ loginError: null });
    if (!u || !p) { play("error"); return; }
    setBusy(true);
    const err = await login(u, p);
    setBusy(false);
    if (err) {
      app.set({ loginError: err });
      play("error");
    } else {
      play("select");
    }
  }

  const invalid = (k: "user" | "pass") =>
    fe[k] ? { "aria-invalid": true, "aria-describedby": `l-${k}-err` } : error === "auth" ? { "aria-invalid": true } : {};

  return (
    <main className="title-screen">
      <div className="title-card">
        <div className="title-logo">
          <Icon name="brand" className="brand-mark" />
          <h1>PIXELBOG</h1>
          <p className="title-sub">Kontakter · CardDAV</p>
        </div>
        <p className="title-sub" aria-hidden="true">— Tryk start —</p>
        <form className="title-form panel" noValidate aria-labelledby="login-title" onSubmit={submit}>
          <h2 className="sr-only" id="login-title">Log ind</h2>
          {error === "auth" ? (
            <div className="alert" role="alert">
              <Icon name="alert" />
              <div><strong>Forkert brugernavn eller kodeord</strong><p>Tjek at Caps Lock er slået fra, og prøv igen.</p></div>
            </div>
          ) : error === "server" ? (
            <div className="alert" role="alert">
              <Icon name="plug" />
              <div><strong>Kan ikke forbinde til serveren</strong><p>{SERVER} svarer ikke. Tjek din forbindelse, eller om Radicale kører.</p></div>
            </div>
          ) : null}
          <div className="field">
            <label className="label" htmlFor="l-user">Brugernavn</label>
            <input ref={userRef} className="input" id="l-user" name="username" autoComplete="username" autoCapitalize="none"
              spellCheck={false} defaultValue={user} {...invalid("user")} />
            {fe.user ? <p className="error-text" id="l-user-err"><Icon name="alert" /><span>Skriv dit brugernavn.</span></p> : null}
          </div>
          <div className="field">
            <label className="label" htmlFor="l-pass">Kodeord</label>
            <input ref={passRef} className="input" id="l-pass" name="password" type="password" autoComplete="current-password" {...invalid("pass")} />
            {fe.pass ? <p className="error-text" id="l-pass-err"><Icon name="alert" /><span>Skriv dit kodeord.</span></p> : null}
          </div>
          <button className={"btn btn-primary btn-block btn-start" + (busy ? " is-loading" : "")} type="submit" aria-disabled={busy || undefined}>
            <span className="btn-label">{busy ? "Forbinder" : error === "server" ? "Prøv igen" : "Log ind"}</span>
          </button>
        </form>
        <div className="title-foot t-soft">
          <span>Server: {SERVER}</span>
          <span>© 2026 · Version 1.0</span>
        </div>
      </div>
    </main>
  );
}
