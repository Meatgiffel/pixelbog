// @vitest-environment jsdom
/* Integrationstest mod en rigtig Radicale. Springes over uden RADICALE_TEST_URL, fx:
   RADICALE_TEST_URL=http://127.0.0.1:5232/ RADICALE_TEST_USER=test RADICALE_TEST_PASS=test npm test */
import { describe, expect, it } from "vitest";
import { AuthError, DavClient, PreconditionError, basicAuth } from "./client";
import { createBook, deleteCard, discover, fetchCards, getCard, listBooks, newHref, putCard } from "./carddav";
import { readContact, writeContact } from "../vcard/contact";
import { parseVCard, serialize } from "../vcard/vcard";

const url = process.env.RADICALE_TEST_URL;
const user = process.env.RADICALE_TEST_USER ?? "test";
const pass = process.env.RADICALE_TEST_PASS ?? "test";

const card = (uid: string, fn: string) =>
  `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\nN:;${fn};;;\r\nFN:${fn}\r\nEND:VCARD\r\n`;

describe.skipIf(!url)("CardDAV mod Radicale", () => {
  const client = new DavClient(url!, basicAuth(user, pass));

  it("afviser forkert kodeord", async () => {
    const bad = new DavClient(url!, basicAuth(user, "forkert"));
    await expect(discover(bad)).rejects.toBeInstanceOf(AuthError);
  });

  it("finder bøger, gemmer, henter, opdager konflikter og sletter", async () => {
    const { home } = await discover(client);
    expect(home).toBe(`/${user}/`);
    const book = await createBook(client, home, "Test & co");
    const books = await listBooks(client, home);
    expect(books.find((b) => b.id === book.id)?.name).toBe("Test & co");

    const href = newHref(book);
    const uid = crypto.randomUUID();
    const etag1 = await putCard(client, href, card(uid, "Første"), null);
    expect(etag1).toMatch(/^".+"$/);
    // opret igen med If-None-Match: * skal fejle
    await expect(putCard(client, href, card(uid, "Dublet"), null)).rejects.toBeInstanceOf(PreconditionError);

    const etag2 = await putCard(client, href, card(uid, "Anden"), etag1);
    await expect(putCard(client, href, card(uid, "Gammel"), etag1)).rejects.toBeInstanceOf(PreconditionError);

    const cards = await fetchCards(client, book);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ href, etag: etag2 });
    expect(cards[0].raw).toContain("FN:Anden");
    expect((await getCard(client, href))?.etag).toBe(etag2);

    await expect(deleteCard(client, href, etag1)).rejects.toBeInstanceOf(PreconditionError);
    await deleteCard(client, href, etag2);
    expect(await getCard(client, href)).toBeNull();
    await deleteCard(client, href, ""); // allerede væk er ok
    await client.request("DELETE", book.href);
  });

  it("bevarer fotos i vCard 3 og 4 gennem Radicale", async () => {
    const { home } = await discover(client);
    const book = await createBook(client, home, "Fotos");
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    for (const version of ["3.0", "4.0"]) {
      const base = parseVCard(`BEGIN:VCARD\r\nVERSION:${version}\r\nUID:foto-${version}\r\nFN:Foto\r\nN:;Foto;;;\r\nEND:VCARD\r\n`);
      const d = readContact(base);
      d.photo = jpeg;
      const href = newHref(book);
      await putCard(client, href, serialize(writeContact(base, d)), null);
      const back = await getCard(client, href);
      expect(readContact(parseVCard(back!.raw)).photo).toBe(jpeg);
    }
    await client.request("DELETE", book.href);
  });

  it("accepterer et navnløst kort med tom FN", async () => {
    const { home } = await discover(client);
    const book = await createBook(client, home, "Navnløs");
    const raw = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:nameless-1\r\nN:;;;;\r\nFN:\r\nTEL;TYPE=CELL:+45 20 10 30 40\r\nEND:VCARD\r\n";
    await putCard(client, newHref(book), raw, null);
    expect(await fetchCards(client, book)).toHaveLength(1);
    await client.request("DELETE", book.href);
  });
});
