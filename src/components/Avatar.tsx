import type { ContactData } from "../vcard/contact";
import { displayName, isNameless } from "../lib/format";
import { Identicon, QuestionBlock, usePixelPhoto } from "../lib/pixel";

interface Props {
  c: ContactData;
  size?: "s" | "m" | "l";
  decorative?: boolean;
}

export function Avatar({ c, size = "s", decorative = true }: Props) {
  const cls = size === "s" ? "avatar" : `avatar avatar-${size}`;
  const name = displayName(c);
  const px = usePixelPhoto(c.photo);
  const hidden = decorative ? { "aria-hidden": true as const } : {};
  if (px) {
    const alt = decorative ? "" : `Foto af ${name}`;
    return (
      <span className={cls} {...hidden}>
        <img className="photo-light" src={px.light} width={40} height={40} alt={alt} />
        <img className="photo-dark" src={px.dark} width={40} height={40} alt={alt} />
      </span>
    );
  }
  if (isNameless(c)) return <span className={cls} {...hidden}><QuestionBlock label="Kontakt uden navn" /></span>;
  return <span className={cls} {...hidden}><Identicon seed={name} label={"Pixel-avatar for " + name} /></span>;
}
