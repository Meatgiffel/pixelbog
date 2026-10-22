import { DialogHost } from "./components/Dialog";
import { Login } from "./components/Login";
import { Shell } from "./components/Shell";
import { Toasts } from "./components/Toasts";
import { app } from "./state/app";
import { useStore } from "./state/store";

export function App() {
  const phase = useStore(app, (s) => s.phase);
  return (
    <>
      {phase === "login" ? <Login /> : <Shell />}
      <Toasts />
      <DialogHost />
    </>
  );
}
