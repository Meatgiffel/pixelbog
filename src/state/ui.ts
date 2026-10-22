/* Dialog- og toast-tilstand. Komponenterne i components/Dialog.tsx og Toasts.tsx tegner dem. */
import type { ReactNode } from "react";
import type { IconName } from "../lib/pixel";
import { createStore } from "./store";

export interface DialogSpec {
  id: number;
  content: ReactNode;
  /** Kaldes ved Escape. Returnér false for at holde dialogen åben. */
  onCancel?: () => boolean | void;
  /** Escape gør ingenting (fx under import) */
  preventCancel?: boolean;
}

export interface Toast {
  id: number;
  title: string;
  msg: string;
  icon: IconName;
  action?: string;
  onAction?: () => void;
  leaving?: boolean;
}

export const ui = createStore<{ dialog: DialogSpec | null; toasts: Toast[] }>({ dialog: null, toasts: [] });

let seq = 0;

export function openDialog(content: ReactNode, opts: Omit<DialogSpec, "id" | "content"> = {}) {
  ui.set({ dialog: { id: ++seq, content, ...opts } });
}

export function closeDialog() {
  ui.set({ dialog: null });
}

export interface ToastOptions {
  action?: string;
  onAction?: () => void;
  ms?: number;
}

export function toast(title: string, msg: string, icon: IconName = "check", opts: ToastOptions = {}) {
  const id = ++seq;
  ui.set((s) => ({ toasts: [...s.toasts, { id, title, msg, icon, action: opts.action, onAction: opts.onAction }] }));
  const timer = setTimeout(() => dismissToast(id), opts.ms ?? 3200);
  return () => { clearTimeout(timer); dismissToast(id); };
}

export function dismissToast(id: number) {
  const still = document.documentElement.classList.contains("fx-still");
  ui.set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
  setTimeout(() => ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), still ? 0 : 180);
}
