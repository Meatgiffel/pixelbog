/* ==========================================================================
   PIXELBOG — eksempeldata (fiktive personer, rigtige danske gader/postnumre)
   ========================================================================== */
(function () {
  "use strict";

  const BOOKS = [
    { id: "personlige", name: "Personlige" },
    { id: "arbejde", name: "Arbejde" },
    { id: "familie", name: "Familie" },
  ];

  const photo = (n) => ({ light: `assets/photos/${n}-dmg.png`, dark: `assets/photos/${n}-crt.png` });
  const ph = (type, value) => ({ type, value });
  const adr = (type, street, postal, city, region = "", country = "Danmark") => ({ type, street, postal, city, region, country });

  let seq = 0;
  function C(book, o) {
    seq++;
    return Object.assign({
      id: "k" + String(seq).padStart(3, "0"),
      book,
      prefix: "", given: "", middle: "", family: "", suffix: "",
      nickname: "", title: "", org: "", photo: null,
      phones: [], emails: [], addresses: [], urls: [],
      birthday: "", note: "",
      etag: "\"" + (1000 + seq) + "\"",
      updated: "2026-10-0" + ((seq % 9) + 1),
    }, o);
  }

  const CONTACTS = [
    /* ---------------- Personlige ---------------- */
    C("personlige", {
      given: "Mette", family: "Kristensen", nickname: "Mette K", title: "UX-designer", org: "Grafisk Værksted ApS",
      photo: photo("mette"),
      phones: [ph("mobil", "+45 28 14 63 90"), ph("hjem", "+45 33 21 45 67")],
      emails: [ph("hjem", "mette.kristensen@mail.dk"), ph("arbejde", "mette@grafiskvaerksted.dk")],
      addresses: [adr("hjem", "Vesterbrogade 12, 3. tv.", "1620", "København V", "Region Hovedstaden")],
      urls: [ph("hjem", "https://mettek.dk")],
      birthday: "1988-11-02",
      note: "Mødtes på Roskilde Festival 2012.\nElsker brætspil — spørg om hun vil med til spilaften.",
    }),
    C("personlige", {
      given: "Fatima", family: "Ali", nickname: "Tima", title: "Sygeplejerske", org: "Rigshospitalet",
      phones: [ph("mobil", "+45 42 77 18 03")],
      emails: [ph("hjem", "fatima.ali@outlook.dk")],
      addresses: [adr("hjem", "Nørrebrogade 148, 2. th.", "2200", "København N", "Region Hovedstaden")],
      birthday: "1991-03-14",
    }),
    C("personlige", {
      given: "Frederik", family: "Møller",
      phones: [ph("mobil", "+45 31 56 02 88")],
      emails: [ph("hjem", "frederik.moller@gmail.com")],
      addresses: [adr("hjem", "Algade 3", "4000", "Roskilde")],
      birthday: "1986-07-21",
      note: "Lånt: \"The Legend of Zelda\" (SNES). Skal returneres!",
    }),
    C("personlige", {
      given: "Sofie", family: "Lund", title: "Bibliotekar", org: "Odense Bibliotekerne",
      phones: [ph("mobil", "+45 26 40 91 77")],
      emails: [ph("hjem", "sofie.lund@mail.dk")],
      addresses: [adr("hjem", "Vestergade 20", "5000", "Odense C", "Region Syddanmark")],
    }),
    C("personlige", {
      given: "Ahmad", family: "Rahimi",
      phones: [ph("mobil", "+45 52 18 33 06"), ph("arbejde", "+45 70 10 20 30")],
      emails: [ph("hjem", "ahmad.rahimi@proton.me")],
    }),
    C("personlige", {
      given: "Ida", family: "Bach", nickname: "Idde",
      phones: [ph("mobil", "+45 23 61 77 45")],
      birthday: "1994-12-30",
    }),
    C("personlige", {
      given: "Oliver", family: "Skov", title: "Tømrer", org: "Skov Byg",
      phones: [ph("mobil", "+45 40 82 15 59")],
      urls: [ph("arbejde", "https://skovbyg.dk")],
    }),
    C("personlige", {
      given: "Freja", family: "Østergaard",
      phones: [ph("mobil", "+45 29 90 13 72")],
      emails: [ph("hjem", "freja.o@mail.dk")],
      addresses: [adr("hjem", "Jernbanegade 7", "6700", "Esbjerg")],
    }),
    C("personlige", {
      given: "Åse", family: "Brandt",
      phones: [ph("hjem", "+45 86 12 40 18")],
      birthday: "1959-05-08",
    }),
    C("personlige", {
      phones: [ph("mobil", "+45 61 22 90 14")],
      note: "Ringede om sofaen fra DBA.",
    }),

    /* ---------------- Arbejde ---------------- */
    C("arbejde", {
      given: "Jonas", family: "Holm", title: "Produktchef", org: "Fjordnet A/S",
      phones: [ph("arbejde", "+45 70 22 14 10"), ph("mobil", "+45 30 11 48 27")],
      emails: [ph("arbejde", "jonas.holm@fjordnet.dk")],
      addresses: [adr("arbejde", "Strandvejen 101", "2900", "Hellerup", "Region Hovedstaden")],
      urls: [ph("arbejde", "https://fjordnet.dk")],
      birthday: "1982-02-17",
      _conflict: true,
    }),
    C("arbejde", {
      given: "Lars", family: "Nørgaard", title: "IT-driftschef", org: "Nordlys Energi A/S",
      photo: photo("lars"),
      phones: [ph("arbejde", "+45 87 30 12 00"), ph("mobil", "+45 21 45 98 30")],
      emails: [ph("arbejde", "lars.norgaard@nordlysenergi.dk")],
      addresses: [adr("arbejde", "Søndergade 45", "8000", "Aarhus C", "Region Midtjylland")],
      birthday: "1979-10-29",
      note: "Ansvarlig for Radicale-serveren. Ring før kl. 15.",
    }),
    C("arbejde", {
      given: "Camilla", family: "Dahl", title: "Advokat", org: "Dahl & Partnere",
      photo: photo("camilla"),
      phones: [ph("arbejde", "+45 33 15 88 40")],
      emails: [ph("arbejde", "cd@dahlpartnere.dk")],
      addresses: [adr("arbejde", "Bredgade 30", "1260", "København K", "Region Hovedstaden")],
      urls: [ph("arbejde", "https://dahlpartnere.dk")],
    }),
    C("arbejde", {
      given: "Peter", family: "Jensen", title: "Revisor", org: "Jensen Revision",
      phones: [ph("arbejde", "+45 98 12 34 56")],
      emails: [ph("arbejde", "peter@jensenrevision.dk")],
      addresses: [adr("arbejde", "Boulevarden 15", "9000", "Aalborg", "Region Nordjylland")],
    }),
    C("arbejde", {
      given: "Henrik", middle: "Bjerregaard", family: "Christiansen-Vindeløv", title: "Seniorkonsulent, digital infrastruktur", org: "Konsulenthuset Østerbro",
      phones: [ph("mobil", "+45 24 66 10 93")],
      emails: [ph("arbejde", "henrik.bjerregaard.christiansen-vindelov@konsulenthuset-osterbro.dk")],
    }),
    C("arbejde", {
      given: "Anne", family: "Mikkelsen", title: "HR-partner", org: "Fjordnet A/S",
      phones: [ph("arbejde", "+45 70 22 14 18")],
      emails: [ph("arbejde", "anne.mikkelsen@fjordnet.dk")],
    }),
    C("arbejde", {
      given: "Rasmus", family: "Poulsen", title: "Udvikler", org: "Fjordnet A/S",
      phones: [ph("mobil", "+45 60 14 77 02")],
      emails: [ph("arbejde", "rasmus.poulsen@fjordnet.dk")],
      urls: [ph("andet", "https://github.com/rpoulsen")],
    }),
    C("arbejde", {
      given: "Maja", family: "Larsen", title: "Projektleder", org: "Nordlys Energi A/S",
      phones: [ph("arbejde", "+45 87 30 12 14")],
      emails: [ph("arbejde", "maja.larsen@nordlysenergi.dk")],
    }),
    C("arbejde", {
      given: "Thomas", family: "Vestergaard",
      phones: [ph("mobil", "+45 51 30 62 84")],
    }),
    C("arbejde", {
      org: "Fjordnet Support",
      phones: [ph("arbejde", "+45 70 22 14 00")],
      emails: [ph("arbejde", "support@fjordnet.dk")],
      urls: [ph("arbejde", "https://fjordnet.dk/support")],
    }),
    C("arbejde", {
      phones: [ph("arbejde", "+45 72 44 18 60")],
    }),

    /* ---------------- Familie ---------------- */
    C("familie", {
      given: "Birgit", family: "Nielsen", nickname: "Mor",
      phones: [ph("mobil", "+45 20 31 77 15"), ph("hjem", "+45 97 42 10 33")],
      emails: [ph("hjem", "birgit.nielsen@mail.dk")],
      addresses: [adr("hjem", "Kirkevej 9", "7400", "Herning", "Region Midtjylland")],
      birthday: "1961-11-07",
    }),
    C("familie", {
      given: "Erik", family: "Nielsen", nickname: "Far",
      phones: [ph("mobil", "+45 20 31 77 16"), ph("hjem", "+45 97 42 10 33")],
      addresses: [adr("hjem", "Kirkevej 9", "7400", "Herning", "Region Midtjylland")],
      birthday: "1958-04-22",
    }),
    C("familie", {
      given: "Mikkel", family: "Thomsen", title: "Kok", org: "Restaurant Havnen",
      photo: photo("mikkel"),
      phones: [ph("mobil", "+45 27 18 40 61")],
      emails: [ph("hjem", "mikkel.thomsen@gmail.com")],
      addresses: [adr("hjem", "Havnegade 4", "5700", "Svendborg", "Region Syddanmark")],
      birthday: "1990-08-11",
    }),
    C("familie", {
      given: "Line", family: "Thomsen",
      phones: [ph("mobil", "+45 27 18 40 62")],
      birthday: "1992-01-25",
    }),
    C("familie", {
      given: "Poul", family: "Kjeldsen", nickname: "Morfar",
      phones: [ph("hjem", "+45 97 12 03 88")],
      birthday: "1936-09-03",
      note: "Hører dårligt i telefonen — ring hellere søndag formiddag.",
    }),
    C("familie", {
      given: "Signe", family: "Nielsen",
      phones: [ph("mobil", "+45 25 55 81 19")],
      emails: [ph("hjem", "signe.n@mail.dk")],
      birthday: "1993-10-31",
    }),
    C("familie", {
      given: "Victor", family: "Nielsen",
      birthday: "2016-06-14",
      note: "Signes søn. Ønsker sig Lego.",
      phones: [],
      addresses: [adr("hjem", "Kirkevej 9", "7400", "Herning", "Region Midtjylland")],
    }),
  ];

  /* Serverversion af Jonas Holm — bruges i konflikt-demoen */
  const SERVER_VERSIONS = {
    k011: { title: "Chief Product Officer", phones: [ph("arbejde", "+45 70 22 14 10"), ph("mobil", "+45 30 11 48 99")], updatedBy: "iPhone", updatedAt: "i går kl. 18.42" },
  };

  /* ---------- Testfil til import: 44 kort, hvoraf 2 er defekte ---------- */
  function sampleVcf() {
    const first = ["Anders", "Bente", "Christian", "Dorthe", "Emil", "Fie", "Gustav", "Hanne", "Ib", "Julie", "Karl", "Lise", "Magnus", "Nanna", "Ole", "Pernille", "Rikke", "Søren", "Tove", "Ulrik", "Vibeke", "William"];
    const last = ["Andersen", "Berg", "Clausen", "Dam", "Eriksen", "Frandsen", "Gregersen", "Hansen", "Iversen", "Juhl", "Kristiansen", "Lauridsen"];
    const towns = [["Vesterbrogade 88", "1620", "København V"], ["Fredensgade 12", "8000", "Aarhus C"], ["Kongensgade 50", "5000", "Odense C"], ["Algade 21", "9000", "Aalborg"]];
    const out = [];
    for (let i = 0; i < 44; i++) {
      if (i === 17) { // defekt: mangler END:VCARD
        out.push("BEGIN:VCARD", "VERSION:3.0", "N:Kortsluttet;Kaj;;;", "FN:Kaj Kortsluttet", "TEL;TYPE=CELL:+45 22 00 00 17");
        continue;
      }
      if (i === 31) { // defekt: tomt kort
        out.push("BEGIN:VCARD", "VERSION:3.0", "NOTE:Ingen data her", "END:VCARD");
        continue;
      }
      const g = first[i % first.length], f = last[(i * 7) % last.length];
      const t = towns[i % towns.length];
      const num = `+45 ${20 + (i % 40)} ${String(10 + i).padStart(2, "0")} ${String(30 + (i * 3) % 60).padStart(2, "0")} ${String(40 + (i * 7) % 50).padStart(2, "0")}`;
      out.push("BEGIN:VCARD", "VERSION:3.0", `N:${f};${g};;;`, `FN:${g} ${f}`, `TEL;TYPE=CELL:${num}`);
      if (i % 3 === 0) out.push(`EMAIL;TYPE=HOME:${g.toLowerCase()}.${f.toLowerCase()}@mail.dk`.replace(/ø/g, "oe").replace(/æ/g, "ae").replace(/å/g, "aa"));
      if (i % 4 === 0) out.push(`ADR;TYPE=HOME:;;${t[0]};${t[2]};;${t[1]};Danmark`);
      out.push("END:VCARD");
    }
    return out.join("\r\n") + "\r\n";
  }

  window.PixelData = { BOOKS, CONTACTS, SERVER_VERSIONS, sampleVcf, SERVER: "radicale.hjem.lan:5232", USER: "sofie" };
  if (typeof module !== "undefined") module.exports = window.PixelData;
})();
