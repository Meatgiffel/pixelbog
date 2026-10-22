/* Import af .vcf: vælg fil → vælg bog → HP-bar → resultat */
import { useState } from "react";
import { Icon } from "../lib/pixel";
import { type ImportPlan, app, contactsIn, importOne, planImport } from "../state/app";
import { go, router } from "../state/router";
import { motionOff, play } from "../state/settings";
import { useStore } from "../state/store";
import { closeDialog, openDialog } from "../state/ui";
import type { CardFailure } from "../vcard/vcard";
import { RpgBox } from "./Dialog";
import { bookName, openCreateBook } from "./actions";

type Step =
  | { step: "pick"; error?: string }
  | { step: "ready"; fileName: string; size: number; plan: ImportPlan }
  | { step: "progress" | "result"; fileName: string; size: number; plan: ImportPlan; done: number; ok: number; failures: CardFailure[]; aborted: boolean };

// Delt med dialogens Escape-håndtering, som ikke kender komponentens state
const live = { step: "pick" as Step["step"], abort: false };

function HpBar({ done, total, finished }: { done: number; total: number; finished?: boolean }) {
  const segs = 20, on = Math.round((done / Math.max(1, total)) * segs);
  return (
    <div className="hp">
      <div className="hp-top">
        <span className="od-row" style={{ ["--od-gap" as string]: "8px" }}><Icon name="heart" className="ic-s" /><span id="hp-label">{finished ? "Færdig" : "Import"}</span></span>
        <span className="t-tabular">{done} / {total}</span>
      </div>
      <div className="hp-bar" role="progressbar" aria-labelledby="hp-label" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={`${done} af ${total} kontakter`}>
        {Array.from({ length: segs }, (_, i) => <i key={i} className={i < on ? "on" : ""} />)}
      </div>
    </div>
  );
}

function ImportFlow({ initialTarget }: { initialTarget: string }) {
  const books = useStore(app, (s) => s.books);
  const [s, setS] = useState<Step>({ step: "pick" });
  const [target, setTarget] = useState(initialTarget);
  const [over, setOver] = useState(false);
  live.step = s.step;

  const cancel = (
    <button type="button" className="btn" onClick={closeDialog}><Icon name="close" /><span className="btn-label">Annuller</span></button>
  );

  function read(f: File) {
    if (!/\.vcf$/i.test(f.name) && !/vcard/i.test(f.type)) { play("error"); setS({ step: "pick", error: `»${f.name}« er ikke en .vcf-fil.` }); return; }
    const r = new FileReader();
    r.onload = () => {
      const plan = planImport(String(r.result));
      if (!plan.total) { play("error"); setS({ step: "pick", error: `Fandt ingen kontakter i »${f.name}«.` }); return; }
      setS({ step: "ready", fileName: f.name, size: f.size, plan });
    };
    r.onerror = () => { play("error"); setS({ step: "pick", error: `»${f.name}« kunne ikke læses.` }); };
    r.readAsText(f);
  }

  async function start() {
    if (s.step !== "ready") return;
    const { plan } = s;
    live.abort = false;
    let done = plan.failures.length, ok = 0;
    const failures = [...plan.failures];
    const base = { ...s, step: "progress" as const, aborted: false };
    setS({ ...base, done, ok, failures });
    const queue = [...plan.cards];
    const minStep = motionOff() ? 0 : 40; // så HP-baren kan nå at ses fylde op
    const worker = async () => {
      while (queue.length && !live.abort) {
        const it = queue.shift()!;
        const t0 = performance.now();
        try {
          await importOne(target, it.card);
          ok++;
        } catch (e) {
          if (app.get().phase !== "ready") return; // logget ud undervejs
          failures.push({ index: it.index, line: it.line, reason: e instanceof Error ? e.message : "Ukendt fejl" });
        }
        done++;
        setS({ ...base, done, ok, failures: [...failures] });
        const wait = minStep - (performance.now() - t0);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (app.get().phase !== "ready") return;
    failures.sort((a, b) => a.index - b.index);
    play(failures.length ? "select" : "done");
    setS({ ...base, step: "result", done, ok, failures, aborted: live.abort });
  }

  if (s.step === "pick") {
    return (
      <RpgBox speaker="Import" text="Vælg en .vcf-fil med kontakter. Jeg tæller dem, før noget bliver importeret." focus="#imp-file" actions={cancel}>
        <label className={"drop" + (over ? " is-over" : "")}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) read(f); }}>
          <Icon name="import" className="ic-l" />
          <span className="t-ui">Vælg .vcf-fil</span>
          <span className="help">eller træk filen herind</span>
          <input type="file" accept=".vcf,text/vcard,text/x-vcard" id="imp-file" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); }} />
        </label>
        {s.error ? <p className="error-text"><Icon name="alert" /><span>{s.error}</span></p> : null}
      </RpgBox>
    );
  }

  if (s.step === "ready") {
    const n = s.plan.total;
    return (
      <RpgBox speaker="Import" text={`Fandt ${n} kontakter i filen. Hvilken adressebog skal de i?`} focus='input[name="imp-book"]:checked'
        actions={<>{cancel}<button type="button" className="btn btn-primary" onClick={() => void start()}><Icon name="import" /><span className="btn-label">Importér {n}</span></button></>}>
        <div className="file-pill">
          <Icon name="note" className="ic-m" />
          <span><strong className="t-data">{s.fileName}</strong><span className="t-data-s t-soft">{n} kontakter · {(s.size / 1024).toFixed(1).replace(".", ",")} kB</span></span>
          <button type="button" className="btn btn-ghost btn-s" onClick={() => setS({ step: "pick" })}>Skift</button>
        </div>
        <fieldset className="fieldset">
          <legend className="label">Importér til</legend>
          <div className="radio-menu">
            {books.map((b) => (
              <label key={b.id}>
                <input type="radio" name="imp-book" value={b.id} checked={b.id === target} onChange={() => setTarget(b.id)} />
                <span className="cursor" aria-hidden="true" />
                <span>{b.name}</span>
                <span className="count">{contactsIn(b.id).length}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </RpgBox>
    );
  }

  const total = s.plan.total;
  if (s.step === "progress") {
    return (
      <RpgBox speaker="Import" text={`Importerer til ${bookName(target)}…`} focus="#imp-abort"
        actions={<button type="button" className="btn" id="imp-abort" onClick={() => { live.abort = true; }}><Icon name="close" /><span className="btn-label">Afbryd</span></button>}>
        <HpBar done={s.done} total={total} />
      </RpgBox>
    );
  }

  const fails = s.failures;
  const text = s.aborted
    ? `Import afbrudt. ${s.ok} kontakter nåede at lande i ${bookName(target)}.`
    : fails.length ? `Næsten perfekt! ${s.ok} nye kontakter er landet i ${bookName(target)}.` : `Perfekt! Alle ${s.ok} kontakter er landet i ${bookName(target)}.`;
  return (
    <RpgBox speaker="Import færdig" text={text} focus="#imp-done"
      actions={<button type="button" className="btn btn-primary" id="imp-done" onClick={() => { closeDialog(); go({ bookId: target, contactId: null, mode: null }); }}><Icon name="check" /><span className="btn-label">Færdig</span></button>}>
      <p className="result-line"><span className="result-ok">{s.ok} importeret</span>{fails.length ? <span className="result-fail">{fails.length} fejlede</span> : null}</p>
      {fails.length ? (
        <div className="od-stack">
          <p className="label">Kunne ikke læses</p>
          <ul className="fail-list">{fails.map((f) => <li key={`${f.index}-${f.line}`}>Kort {f.index} (linje {f.line}): {f.reason}</li>)}</ul>
        </div>
      ) : null}
      <HpBar done={s.done} total={total} finished />
    </RpgBox>
  );
}

export function openImport() {
  const books = app.get().books;
  if (!books.length) { openCreateBook(); return; }
  const { bookId } = router.get().route;
  const target = books.some((b) => b.id === bookId) ? bookId : books[0].id;
  live.step = "pick";
  openDialog(<ImportFlow initialTarget={target} />, {
    onCancel: () => {
      if (live.step === "progress") { live.abort = true; return false; }
    },
  });
}
