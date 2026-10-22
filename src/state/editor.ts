/* Formularens status, så konsollen (mobil) og kabinettet kan vise "Ikke gemt" og kalde Gem/Annuller. */
import { createStore } from "./store";

export const editor = createStore<{ dirty: boolean; saving: boolean }>({ dirty: false, saving: false });

export const editorActions: { save: () => void; cancel: () => void } = {
  save: () => {},
  cancel: () => {},
};
