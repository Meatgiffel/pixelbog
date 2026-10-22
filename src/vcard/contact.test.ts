import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVCard, parseVcf, serialize } from "./vcard";
import { ensureRequired, newCard, readContact, writeContact, type ContactData } from "./contact";

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n";

const IPHONE = crlf([
  "BEGIN:VCARD",
  "VERSION:3.0",
  "PRODID:-//Apple Inc.//iPhone OS 17.0//EN",
  "N:Kristensen;Mette;Marie;Dr.;",
  "FN:Dr. Mette Marie Kristensen",
  "ORG:Grafisk Værksted ApS;Design",
  "TITLE:UX-designer",
  "item1.TEL;type=CELL;type=VOICE;type=pref:+45 28 14 63 90",
  "item1.X-ABLabel:_$!<Mobile>!$_",
  "item2.TEL:+45 33 21 45 67",
  "item2.X-ABLabel:_$!<Home>!$_",
  "EMAIL;type=INTERNET;type=HOME;type=pref:mette@mail.dk",
  "item3.ADR;type=HOME;type=pref:;;Vesterbrogade 12\\, 3. tv.;København V;;1620;Danmark",
  "item3.X-ABADR:dk",
  "BDAY;VALUE=date:1988-11-02",
  "NOTE:Linje 1\\nLinje 2\\, med komma",
  "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRg==",
  "X-SOCIALPROFILE;type=twitter:https://twitter.com/mette",
  "UID:ios-1",
  "END:VCARD",
]);

const THUNDERBIRD_V4 = crlf([
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Jonas Holm",
  "TEL;TYPE=cell;VALUE=uri:tel:+45-42-77-18-03",
  "BDAY:--1102",
  "PHOTO:data:image/png;base64,iVBORw0KGgo=",
  "UID:tb-1",
  "END:VCARD",
]);

const ANDROID_21 = crlf([
  "BEGIN:VCARD",
  "VERSION:2.1",
  "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:N=C3=B8rgaard;Lars;;;",
  "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Lars N=C3=B8rgaard",
  "TEL;CELL;PREF:+4526409177",
  "NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:F=C3=B8rste linje og en meget lang linje der er delt med bl=",
  "=C3=B8d linjeskift",
  "END:VCARD",
]);

describe("vcard lav-niveau", () => {
  it("bevarer et uændret kort linje for linje", () => {
    const out = serialize(parseVCard(IPHONE));
    expect(out).toBe(IPHONE);
  });

  it("folder lange linjer og udfolder dem igen", () => {
    const long = "NOTE:" + "æøå ".repeat(40);
    const card = parseVCard(crlf(["BEGIN:VCARD", "VERSION:3.0", long, "END:VCARD"]));
    card.props[1].raw = null; // tving genopbygning
    const out = serialize(card);
    for (const l of out.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(parseVCard(out).props[1].value).toBe(long.slice(5));
  });

  it("finder kort uden END:VCARD", () => {
    const { cards, failures } = parseVcf("BEGIN:VCARD\nVERSION:3.0\nFN:A\nEND:VCARD\nBEGIN:VCARD\nFN:B\n");
    expect(cards).toHaveLength(1);
    expect(failures).toEqual([{ index: 2, line: 5, reason: "Mangler END:VCARD" }]);
  });
});

describe("readContact", () => {
  it("læser et iPhone-kort", () => {
    const c = readContact(parseVCard(IPHONE));
    expect(c).toMatchObject({
      prefix: "Dr.", given: "Mette", middle: "Marie", family: "Kristensen",
      org: "Grafisk Værksted ApS, Design", title: "UX-designer",
      birthday: "1988-11-02", note: "Linje 1\nLinje 2, med komma",
      photo: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    });
    expect(c.phones.map((p) => [p.type, p.value])).toEqual([["mobil", "+45 28 14 63 90"], ["hjem", "+45 33 21 45 67"]]);
    expect(c.emails.map((p) => [p.type, p.value])).toEqual([["hjem", "mette@mail.dk"]]);
    expect(c.addresses[0]).toMatchObject({ type: "hjem", street: "Vesterbrogade 12, 3. tv.", postal: "1620", city: "København V", country: "Danmark" });
  });

  it("læser vCard 4 uden N, med tel:-URI og fødselsdag uden år", () => {
    const c = readContact(parseVCard(THUNDERBIRD_V4));
    expect(c).toMatchObject({ given: "Jonas", family: "Holm", birthday: "--11-02", photo: "data:image/png;base64,iVBORw0KGgo=" });
    expect(c.phones[0]).toMatchObject({ type: "mobil", value: "+45-42-77-18-03" });
  });

  it("afkoder quoted-printable fra vCard 2.1", () => {
    const c = readContact(parseVCard(ANDROID_21));
    expect(c.family).toBe("Nørgaard");
    expect(c.note).toBe("Første linje og en meget lang linje der er delt med blød linjeskift");
    expect(c.phones[0]).toMatchObject({ type: "mobil", value: "+4526409177" });
  });

  it("springer over vCard 4-fotos, som Radicale har klippet over", () => {
    const c = readContact(parseVCard(crlf(["BEGIN:VCARD", "VERSION:4.0", "FN:X", "PHOTO:data:image/png\\;base64", "END:VCARD"])));
    expect(c.photo).toBeNull();
    const ok = readContact(parseVCard(crlf(["BEGIN:VCARD", "VERSION:4.0", "FN:X", "PHOTO:data:image/png\\;base64\\,iVBOR", "END:VCARD"])));
    expect(ok.photo).toBe("data:image/png;base64,iVBOR");
  });

  it("læser Apples fødselsdag uden år", () => {
    const c = readContact(parseVCard(crlf(["BEGIN:VCARD", "VERSION:3.0", "FN:X", "BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-14", "END:VCARD"])));
    expect(c.birthday).toBe("--03-14");
  });

  it("deler ikke et telefonnummer i FN op som navn", () => {
    const c = readContact(parseVCard(crlf(["BEGIN:VCARD", "VERSION:3.0", "N:;;;;", "FN:+45 20 10 30 40", "TEL:+45 20 10 30 40", "END:VCARD"])));
    expect([c.given, c.family]).toEqual(["", ""]);
  });
});

describe("writeContact", () => {
  const edit = (raw: string, fn: (d: ContactData) => void) => {
    const base = parseVCard(raw);
    const d = structuredClone(readContact(base));
    fn(d);
    return serialize(writeContact(base, d));
  };

  it("ændrer intet, når intet er rettet", () => {
    expect(edit(IPHONE, () => {})).toBe(IPHONE);
    expect(edit(THUNDERBIRD_V4, () => {})).toBe(THUNDERBIRD_V4);
  });

  it("retter kun den ændrede linje og bevarer resten", () => {
    const out = edit(IPHONE, (d) => { d.title = "Art director"; });
    expect(out).toContain("TITLE:Art director\r\n");
    expect(out.replace("TITLE:Art director", "TITLE:UX-designer")).toBe(IPHONE);
  });

  it("opdaterer N og FN sammen og escaper", () => {
    const out = edit(IPHONE, (d) => { d.family = "Kristensen-Holm"; d.org = "Værksted; Nord"; });
    expect(out).toContain("N:Kristensen-Holm;Mette;Marie;Dr.;\r\n");
    expect(out).toContain("FN:Dr. Mette Marie Kristensen-Holm\r\n");
    expect(out).toContain("ORG:Værksted\\; Nord\r\n");
  });

  it("beholder PREF og gruppe, men fjerner forældet Apple-label ved typeskift", () => {
    const out = edit(IPHONE, (d) => { d.phones[0].type = "arbejde"; });
    expect(out).toContain("item1.TEL;TYPE=VOICE,pref,WORK:+45 28 14 63 90\r\n");
    expect(out).not.toContain("_$!<Mobile>!$_");
    expect(out).toContain("item2.X-ABLabel:_$!<Home>!$_");
  });

  it("fjerner en slettet række med dens label og tilføjer nye rækker", () => {
    const out = edit(IPHONE, (d) => {
      d.phones.splice(1, 1);
      d.emails.push({ type: "arbejde", value: "mette@grafiskvaerksted.dk" });
      d.urls.push({ type: "hjem", value: "https://mettek.dk" });
    });
    expect(out).not.toContain("33 21 45 67");
    expect(out).not.toContain("_$!<Home>!$_");
    expect(out).toContain("EMAIL;type=INTERNET;type=HOME;type=pref:mette@mail.dk\r\nEMAIL;TYPE=WORK:mette@grafiskvaerksted.dk\r\n");
    expect(out).toContain("URL;TYPE=HOME:https://mettek.dk\r\n");
    expect(out).toContain("X-SOCIALPROFILE;type=twitter:https://twitter.com/mette");
  });

  it("skriver adresse og note korrekt escapet", () => {
    const out = edit(IPHONE, (d) => { d.addresses[0].street = "Algade 3, st."; d.note = "a;b\nc"; });
    expect(out).toContain("item3.ADR;TYPE=pref,HOME:;;Algade 3\\, st.;København V;;1620;Danmark\r\n");
    expect(out).toContain("item3.X-ABADR:dk");
    expect(out).toContain("NOTE:a\\;b\\nc\r\n");
  });

  it("skriver foto i versionens format", () => {
    const jpeg = "data:image/jpeg;base64,AAAA";
    expect(edit(IPHONE, (d) => { d.photo = jpeg; })).toContain("PHOTO;ENCODING=b;TYPE=JPEG:AAAA\r\n");
    expect(edit(THUNDERBIRD_V4, (d) => { d.photo = jpeg; })).toContain("PHOTO:data:image/jpeg\\;base64\\,AAAA\r\n");
    expect(edit(IPHONE, (d) => { d.photo = null; })).not.toContain("PHOTO");
  });

  it("skriver fødselsdag i versionens format", () => {
    expect(edit(THUNDERBIRD_V4, (d) => { d.birthday = "1990-05-17"; })).toContain("BDAY:19900517\r\n");
    expect(edit(IPHONE, (d) => { d.birthday = "1990-05-17"; })).toContain("BDAY:1990-05-17\r\n");
    expect(edit(IPHONE, (d) => { d.birthday = ""; })).not.toContain("BDAY");
  });

  it("retter et vCard 4 tel:-nummer til almindelig tekst", () => {
    expect(edit(THUNDERBIRD_V4, (d) => { d.phones[0].value = "+45 42 77 18 04"; })).toContain("TEL;TYPE=cell:+45 42 77 18 04\r\n");
  });

  it("bygger et nyt kort med de påkrævede felter", () => {
    const d = readContact(newCard("ny-1"));
    Object.assign(d, { given: "Fatima", family: "Ali", phones: [{ type: "mobil", value: "+45 42 77 18 03" }, { type: "hjem", value: "  " }] });
    const out = serialize(writeContact(newCard("ny-1"), d));
    expect(out).toBe(crlf([
      "BEGIN:VCARD", "VERSION:3.0", "PRODID:-//Pixelbog//Radicale UI//DA", "UID:ny-1",
      "N:Ali;Fatima;;;", "FN:Fatima Ali", "TEL;TYPE=CELL:+45 42 77 18 03", "END:VCARD",
    ]));
  });

  it("overskriver serverens version med alle styrede felter", () => {
    const server = parseVCard(IPHONE.replace("TITLE:UX-designer", "TITLE:Chef"));
    const mine = structuredClone(readContact(parseVCard(IPHONE)));
    mine.title = "Art director";
    const out = serialize(writeContact(server, mine, { replaceAll: true }));
    expect(out).toContain("TITLE:Art director");
    expect(out).toContain("X-SOCIALPROFILE");
    expect(readContact(parseVCard(out))).toMatchObject({ ...mine, phones: expect.any(Array), emails: expect.any(Array), addresses: expect.any(Array), urls: expect.any(Array) });
  });

  it("tilføjer UID og FN til importerede kort", () => {
    const card = ensureRequired(parseVCard("BEGIN:VCARD\nVERSION:3.0\nN:Lund;Sofie;;;\nEND:VCARD\n"), () => "u-1");
    expect(serialize(card)).toBe(crlf(["BEGIN:VCARD", "VERSION:3.0", "UID:u-1", "N:Lund;Sofie;;;", "FN:Sofie Lund", "END:VCARD"]));
  });
});

describe("designets eksempelfil", () => {
  it("indeholder 44 kort", () => {
    const text = readFileSync(new URL("../../design/assets/eksempel-kontakter.vcf", import.meta.url), "utf8");
    const { cards, failures } = parseVcf(text);
    expect(cards.length + failures.length).toBe(44);
  });
});
