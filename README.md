# NašSpisak

Mobilna web aplikacija za zajedničku nabavku, napravljena u Next.js App Routeru, TypeScriptu i Tailwind CSS-u. Interfejs koristi prilagođene shadcn/ui komponente. Podaci se čuvaju u SQLite bazi na serveru.

## Pokretanje

Potreban je Node.js 24 ili noviji.

```sh
npm install
npm run dev
```

Otvori http://localhost:3000. U probnom prikazu možeš da isprobaš dodavanje, izmenu i čekiranje stavki. Probni spiskovi se čuvaju u pregledaču. Za svoje sinhronizovane spiskove izaberi „Prijavi se“ pa „Napravi nalog“.

Za proveru rada bez interneta koristi produkcijski režim:

```sh
npm run build
npm start
```

Na računaru radi preko localhost adrese. Za test na više telefona koristi jednu zajedničku HTTPS adresu. Service worker u produkcijskom režimu omogućava ponovno otvaranje ranije učitane aplikacije bez veze. Prvi put otvori spisak dok imaš vezu i sačekaj da pregledač instalira service worker.

## Deljenje i rad bez interneta

- Link za spisak može prihvatiti više korisnika. Poziv za ceo folder je jednokratan. Oba linka važe sedam dana. Pozvani korisnik se prijavljuje i eksplicitno prihvata poziv. Dodatne dozvole za dodavanje, izmenu i brisanje biraju se pojedinačno. Svako ko ima pristup može da vidi i čekira stavke.
- Poziv za folder daje pristup postojećim i budućim spiskovima u njemu. Kada osoba ima i direktan pristup spisku, dozvole za spisak imaju prednost nad dozvolama iz foldera. Uklanjanje direktnog pristupa može ostaviti pristup preko foldera.
- Aktivne kartice traže izmene otprilike na 1,6 sekundi. Izmene se traže i pri povratku na karticu ili ponovnom povezivanju.
- U nedostatku interneta čekiranje se odmah vidi i upisuje u trajni lokalni red. Po povratku veze šalje se eksplicitni status stavke. Poslednji status koji server prihvati važi kada oba korisnika menjaju istu oznaku. Izmene količine ili napomene ostaju sačuvane. Ako je stavka izbrisana ili je ukinut pristup, aplikacija prikazuje obaveštenje.
- Dodavanje, izmena, brisanje i čekiranje namirnica, kao i kreiranje i preimenovanje spiskova i foldera, rade bez veze uz lokalni red za sinhronizaciju. Lokalna kopija spiska dostupna je na onom pregledaču koji ga je već učitao.

## Server

Pokreni jednu trajnu instancu Node procesa sa upisivim, trajnim diskom. Fajl baze je po podrazumevanom podešavanju `data/spisak.sqlite`. Za drugu lokaciju podesi `SPISAK_DB_PATH`. Iza HTTPS reverse proxyja postavi `SPISAK_ORIGIN` na javni origin, na primer `https://spisak.example.com`, bez završne kose crte. Na reverse proxyju postavi ograničenje veličine i učestalosti zahteva.

Prijava je putem mejla i lozinke, bez slanja poruka. Potvrda adrese i automatski reset lozinke nisu uključeni. Model za pokretanje podrazumeva zajednički server sa trajnim diskom.

## Provere

```sh
npm test
npm run test:api
npm run typecheck
npm run build
```

Ručna provera offline toka:

1. Registruj dva naloga u dva odvojena profila pregledača.
2. Na prvom napravi folder i spisak, dodaj namirnicu i podeli spisak sa drugim nalogom. Ostavi početnu dozvolu za pregled i čekiranje.
3. Prihvati poziv na drugom nalogu. Proveri da ne može da dodaje ili menja, ali može da čekira stavke.
4. Na drugom nalogu isključi internet, čekiraj stavku i ponovo otvori aplikaciju. Na prvom nalogu izmeni količinu iste stavke.
5. Vrati vezu drugom nalogu. Na oba uređaja proveri da je stavka označena i da ima novu količinu.
6. Podeli folder posebnim pozivom sa trećim nalogom. Dodaj nov spisak u deljeni folder i proveri da se pojavio kod primaoca.

## Vercel i Turso

U produkcijskom okruženju podesite TURSO_DATABASE_URL i TURSO_AUTH_TOKEN sa dozvolom za čitanje i upis. Ponovo objavite aplikaciju. Server kreira tabele pri prvom pristupu bazi. Za lokalni razvoj bez Turso promenljivih koristi se SQLite fajl.
