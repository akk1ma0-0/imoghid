// Статический контент публичных страниц /despre /faq /confidentialitate /termeni.
// Правится ВРУЧНУЮ (до 2026-11-19 генерировался из docs/*.docx скриптом scripts/gen-legal-content.mjs —
// генератор больше не используется, .docx в docs/ устарели). Тексты платежей по подписке — из
// юридического текста v2 (после ответа юриста). Заголовки h2 получают id = legalSlug(text)
// (lib/legal-slug.ts): якоря /termeni#abonament-tarife-si-plati и /termeni#plata-si-rambursare.

export type LegalBlock = { t: "h2" | "h3" | "q" | "p" | "li"; text: string };
export type LegalDoc = { title: string; blocks: LegalBlock[] };

export const LEGAL_DOCS: Record<"despre" | "faq" | "confidentialitate" | "termeni", LegalDoc> =
{
  "despre": {
    "title": "Despre ImoGhid",
    "blocks": [
      {
        "t": "p",
        "text": "ImoGhid este o platformă digitală creată pentru agenții imobiliari din Republica Moldova, care asistă pregătirea tranzacțiilor imobiliare: verifică obiectul după numărul cadastral, afișând sarcinile, interdicțiile și notările din sursa oficială (Registrul bunurilor imobile, prin Agenția de Guvernare Electronică), analizează documentele, organizează dosarul tranzacției și ghidează agentul pas cu pas — de la verificarea obiectului până la lista de documente necesare."
      },
      {
        "t": "p",
        "text": "Aplicația aduce într-un singur loc verificarea informativă a datelor cadastrale, analiza documentelor și organizarea muncii agentului, cu respectarea cadrului legal al Republicii Moldova."
      },
      {
        "t": "p",
        "text": "ImoGhid este un produs dezvoltat sub marca comercială BiSeeTh, de „BlackSpace Tech” SRL, în colaborare cu Liudmila Popovscaia, expert în drept imobiliar, care a contribuit la concepția juridică și funcțională a platformei. Contact: liudmila.popovscaia@gmail.com. Răspundem în maximum 36 de ore lucrătoare. Telefon de contact: +373 69 427 567."
      }
    ]
  },
  "faq": {
    "title": "Întrebări frecvente",
    "blocks": [
      {
        "t": "q",
        "text": "Ce face ImoGhid?"
      },
      {
        "t": "p",
        "text": "Vă ajută să pregătiți o tranzacție imobiliară: verifică obiectul după numărul cadastral, afișând sarcinile, interdicțiile și notările din sursa oficială (Registrul bunurilor imobile), analizează, cu ajutorul inteligenței artificiale, documentele încărcate și construiește dosarul tranzacției cu liste de verificare."
      },
      {
        "t": "q",
        "text": "Datele cadastrale afișate sunt oficiale?"
      },
      {
        "t": "p",
        "text": "Datele provin din sursa oficială (Registrul bunurilor imobile, prin Agenția de Guvernare Electronică) și nu sunt generate de inteligența artificială, dar au titlu informativ și reflectă starea la momentul interogării; nu produc consecințe juridice. Pentru certitudine juridică se comandă extrasul oficial din Registrul bunurilor imobile."
      },
      {
        "t": "q",
        "text": "De ce am nevoie de un extras dacă văd deja datele?"
      },
      {
        "t": "p",
        "text": "Verificarea din Registrul bunurilor imobile (prin Agenția de Guvernare Electronică) arată informații generale și indicatori de tipul „există / nu există” (de ex. interdicții). Detaliile (proprietarul, temeiul dreptului, conținutul grevărilor) se obțin doar prin extrasul oficial."
      },
      {
        "t": "q",
        "text": "Cum conectez contul meu 999.md?"
      },
      {
        "t": "p",
        "text": "Din cabinetul dvs. în ImoGhid, prin tokenul propriu de la 999.md. După conectare puteți gestiona propriile anunțuri direct din Aplicație."
      },
      {
        "t": "q",
        "text": "Cine plătește anunțurile pe 999.md?"
      },
      {
        "t": "p",
        "text": "Dvs., din contul dvs. 999.md. Anunțurile apar în numele dvs., iar plățile sunt în raportul direct cu 999.md. ImoGhid nu intermediază aceste plăți."
      },
      {
        "t": "q",
        "text": "Datele mele și ale clienților sunt în siguranță?"
      },
      {
        "t": "p",
        "text": "Aplicăm măsuri tehnice și organizatorice de securitate. Pentru datele proprietarilor pe care le încărcați, dvs. rămâneți responsabil de existența temeiului legal. Detalii — în Politică de confidențialitate."
      },
      {
        "t": "q",
        "text": "Ce abonamente există?"
      },
      {
        "t": "p",
        "text": "Basic (300 MDL/lună), Pro (500 MDL/lună) și HUB/Agenție (450 MDL pe loc, lunar, minimum 3 locuri). Pentru o singură verificare există și „O accesare” (30 MDL, plată unică). Abonamentul ImoGhid este separat de eventualele taxe ale 999.md. Prețurile nu includ TVA (Furnizorul nu este plătitor de TVA). Ce include fiecare:"
      },
      {
        "t": "li",
        "text": "O accesare (30 MDL, plată unică): pachet de trei drepturi unice: 1 verificare cadastrală, 1 examinare a dosarului și 1 obiect."
      },
      {
        "t": "li",
        "text": "Basic (300 MDL/lună): verificare cadastrală 50/lună; examinarea dosarului 30/lună; Obiectele mele până la 20 de obiecte active simultan; Creator Hub 20 de postări/lună; Check-list acte, Tipuri de acte ale imobilului și Actele mele (set complet). Anunțuri 999 nu este inclus."
      },
      {
        "t": "li",
        "text": "Pro (500 MDL/lună): verificare cadastrală nelimitată; examinarea dosarului 60/lună; Obiectele mele nelimitate; Creator Hub 60/lună; Anunțuri 999 60/lună; același set de acte ca în Basic."
      },
      {
        "t": "li",
        "text": "HUB/Agenție (450 MDL/loc, lunar, minimum 3 locuri): pentru fiecare agent: verificare cadastrală și Obiectele mele nelimitate; examinarea dosarului 70/lună; Creator Hub 70/lună; Anunțuri 999 70/lună; același set de acte. Limitele se numără separat pentru fiecare agent."
      },
      {
        "t": "li",
        "text": "Peste limită, unele funcții se pot plăti suplimentar: examinarea dosarului (Basic 15 MDL, Pro 10 MDL, HUB 5 MDL) și verificarea cadastrală pe Basic (5 MDL)."
      },
      {
        "t": "q",
        "text": "Se reînnoiește abonamentul automat?"
      },
      {
        "t": "p",
        "text": "Da. Cu bifarea acordului la plată, suma se debitează în fiecare lună de pe cardul salvat, cu o zi înainte de sfârșitul perioadei. Cu 3 zile înainte primiți un e-mail. Puteți anula oricând."
      },
      {
        "t": "q",
        "text": "Cum anulez abonamentul?"
      },
      {
        "t": "p",
        "text": "Profil, „Anulează abonamentul”. Nu se mai debitează nimic, iar accesul rămâne până la sfârșitul perioadei plătite. Până atunci puteți relua abonamentul."
      },
      {
        "t": "q",
        "text": "Pot primi banii înapoi?"
      },
      {
        "t": "p",
        "text": "Serviciul digital se furnizează imediat după plată, iar perioada deja plătită nu se returnează la anulare sau la schimbarea planului, cu excepția plăților efectuate din eroare (de ex. debitare dublă) și a cazurilor prevăzute de lege. Scrieți la info@biseeth.md; răspundem în 5 zile lucrătoare."
      },
      {
        "t": "q",
        "text": "De ce trebuie să bifez caseta înainte de plată?"
      },
      {
        "t": "p",
        "text": "Prin ea confirmați că ați citit Condițiile de plată, Termenii de returnare și Termenii și că sunteți de acord ca serviciul digital să fie furnizat imediat după achitare. Fără bifare, plata nu se efectuează."
      },
      {
        "t": "q",
        "text": "Ce se întâmplă dacă debitarea este respinsă?"
      },
      {
        "t": "p",
        "text": "Accesul se păstrează 5 zile după sfârșitul perioadei plătite. Primiți un e-mail, iar la un refuz temporar încercăm din nou. Puteți actualiza cardul din Aplicație („Schimbă cardul”)."
      },
      {
        "t": "q",
        "text": "Cum schimb cardul?"
      },
      {
        "t": "p",
        "text": "Profil, „Schimbă cardul”. Cardul se verifică fără debitare, iar noul card se folosește pentru plățile următoare."
      },
      {
        "t": "q",
        "text": "Cum trec la alt plan?"
      },
      {
        "t": "p",
        "text": "Trecerea la un plan superior se aplică imediat, cu plata integrală și perioadă nouă. Trecerea la un plan inferior se aplică de la perioada următoare."
      },
      {
        "t": "q",
        "text": "Cum funcționează abonamentul agenției?"
      },
      {
        "t": "p",
        "text": "Administratorul plătește un număr de locuri, invită agenții cu coduri și poate adăuga locuri (proporțional cu zilele rămase) sau le poate reduce de la perioada următoare. Dacă administratorul anulează abonamentul sau își șterge contul, membrii pierd accesul HUB (la anulare, la sfârșitul perioadei plătite; la ștergerea contului, imediat)."
      },
      {
        "t": "q",
        "text": "Cum șterg contul?"
      },
      {
        "t": "p",
        "text": "Profil, „Ștergeți contul”. Abonamentele se anulează, cardurile salvate se șterg, iar evidența plăților se păstrează 6 ani conform legii."
      }
    ]
  },
  "confidentialitate": {
    "title": "Politică de confidențialitate",
    "blocks": [
      {
        "t": "p",
        "text": "Prezenta Politică explică modul în care Compania dezvoltatoare, „BlackSpace Tech” SRL, prelucrează datele cu caracter personal în cadrul aplicației ImoGhid (denumită în continuare „Aplicația”), destinată agenților imobiliari din Republica Moldova."
      },
      {
        "t": "h2",
        "text": "Operatorul de date"
      },
      {
        "t": "li",
        "text": "Operator: „BlackSpace Tech” SRL, IDNO 1024600065567, sediu mun. Chișinău, bd Decebal 99D, MD-2038, Republica Moldova, care administrează marca BiSeeTh."
      },
      {
        "t": "li",
        "text": "Contact: info@biseeth.md. Răspundem în maximum 36 de ore lucrătoare. Telefon de contact: +373 69 427 567."
      },
      {
        "t": "h2",
        "text": "Cadrul legal aplicabil"
      },
      {
        "t": "p",
        "text": "Prelucrarea se efectuează în conformitate cu Legea nr. 195/2024 privind protecția datelor cu caracter personal (de la data intrării în vigoare), iar până atunci cu Legea nr. 133/2011, precum și cu actele normative subsecvente."
      },
      {
        "t": "h2",
        "text": "Categoriile de date prelucrate"
      },
      {
        "t": "li",
        "text": "Date despre utilizatori (agenți): nume, prenume, e-mail, telefon, date de cont, date privind abonamentul și plata, jurnale de utilizare, adresă IP."
      },
      {
        "t": "li",
        "text": "Date de plată: tokenul cardului emis de procesatorul de plăți, ultimele 4 cifre, tipul cardului (Visa/Mastercard), data expirării, istoricul plăților și al abonamentului, acordurile pentru debitare recurentă și confirmarea la plată a furnizării imediate a serviciului digital (data, versiunea textului). La acordul pentru plată se păstrează și adresa IP și user-agent-ul, ca dovadă a acordului. Numărul complet al cardului și codul CVV nu ajung la noi și nu sunt stocate de ImoGhid."
      },
      {
        "t": "li",
        "text": "Date de securitate și jurnal de audit: evenimentele de autentificare (data și ora conectării, conectări eșuate), verificările cadastrale efectuate (data, obiectul verificat, utilizatorul care a inițiat verificarea), consumul de limite și acțiunile administrative. Adresa IP și user-agent nu se păstrează în acest jurnal."
      },
      {
        "t": "li",
        "text": "Date introduse de utilizatori despre obiecte și tranzacții: informații extrase din documentele încărcate, date cadastrale consultate, date despre părțile tranzacției."
      },
      {
        "t": "h2",
        "text": "Rolurile părților (operator / persoană împuternicită)"
      },
      {
        "t": "li",
        "text": "pentru datele utilizatorilor și pentru funcționarea Aplicației, Compania dezvoltatoare acționează în calitate de operator."
      },
      {
        "t": "li",
        "text": "pentru datele terților (proprietari etc.) încărcate de utilizator, Compania dezvoltatoare acționează în calitate de persoană împuternicită, prelucrând la instrucțiunea utilizatorului, care rămâne responsabil de existența unui temei legal (inclusiv consimțământul)."
      },
      {
        "t": "h2",
        "text": "Scopurile prelucrării"
      },
      {
        "t": "p",
        "text": "Furnizarea serviciilor (verificare cadastrală informativă, analiza documentelor, generarea dosarului tranzacției, liste de verificare, calcule), gestionarea contului și a abonamentului, facturarea, suportul, asigurarea securității, conformarea legală și îmbunătățirea serviciului."
      },
      {
        "t": "h2",
        "text": "Temeiul legal al prelucrării"
      },
      {
        "t": "li",
        "text": "executarea contractului cu utilizatorul;"
      },
      {
        "t": "li",
        "text": "consimțământul, acolo unde este cerut;"
      },
      {
        "t": "li",
        "text": "interesul legitim (securitate, prevenirea fraudelor, îmbunătățirea serviciului);"
      },
      {
        "t": "li",
        "text": "îndeplinirea unei obligații legale."
      },
      {
        "t": "li",
        "text": "Pentru plăți și abonament (inclusiv transferul datelor către bancă și procesatorul de plăți): executarea contractului cu utilizatorul."
      },
      {
        "t": "li",
        "text": "Pentru evidența contabilă și fiscală a plăților: obligația legală a Furnizorului."
      },
      {
        "t": "li",
        "text": "Pentru jurnalul de audit: interesul legitim al Furnizorului (securitatea sistemului, prevenirea abuzurilor, evidența utilizării datelor din registrele publice conform acordului cu AGE)."
      },
      {
        "t": "h2",
        "text": "Prelucrarea automatizată și inteligența artificială"
      },
      {
        "t": "p",
        "text": "Aplicația utilizează un agent bazat pe inteligență artificială exclusiv pentru a extrage și verifica informații din documentele încărcate de utilizator. Datele privind sarcinile, interdicțiile și notările asupra bunurilor imobile nu sunt generate de inteligența artificială: ele provin din sursa oficială (Registrul bunurilor imobile, prin Agenția de Guvernare Electronică). Rezultatele au caracter asistiv și orientativ; Aplicația nu adoptă decizii cu efect juridic exclusiv automatizat, fără intervenție umană. Având în vedere utilizarea unor tehnologii noi, se realizează o Evaluare a impactului asupra protecției datelor (DPIA), conform cadrului legal."
      },
      {
        "t": "h2",
        "text": "Surse externe"
      },
      {
        "t": "li",
        "text": "datele privind sarcinile, interdicțiile și notările provin din sursa oficială — Registrul bunurilor imobile, prin Agenția de Guvernare Electronică (AGE) — și au titlu informativ, fără a produce consecințe juridice;"
      },
      {
        "t": "li",
        "text": "integrarea cu 999.md se realizează prin contul propriu al utilizatorului, sub autentificarea (tokenul) acestuia."
      },
      {
        "t": "h2",
        "text": "Verificarea sarcinilor și interdicțiilor"
      },
      {
        "t": "p",
        "text": "Când verificați un imobil după numărul cadastral, ImoGhid transmite acest număr către Agenția de Guvernare Electronică (prin platforma de interoperabilitate MConnect) și afișează rezultatul: sarcini, interdicții, notări și cotele titularilor de drepturi. Alte date despre dumneavoastră sau despre clienții dumneavoastră nu sunt transmise."
      },
      {
        "t": "p",
        "text": "Solicitările sunt făcute din numele ImoGhid („BlackSpace Tech” SRL), printr-o conexiune securizată și autentificată. Datele primite provin din sursa oficială, nu sunt generate de inteligența artificială și reflectă starea imobilului la momentul verificării."
      },
      {
        "t": "p",
        "text": "Păstrăm un jurnal al verificărilor efectuate: data și ora, numărul cadastral și rezultatul (găsit / negăsit / eroare). Jurnalul este necesar pentru securitate și pentru a putea răspunde solicitărilor autorităților. Acesta nu conține codul personal (IDNP), numele, e-mailul sau alte date ale contului dumneavoastră. Contul dumneavoastră păstrează doar numărul de verificări efectuate în perioada curentă, pentru respectarea limitelor abonamentului. Dacă creați un dosar pe baza verificării, numărul cadastral și rezultatul se salvează în dosarul din contul dumneavoastră. Termen de păstrare a jurnalului: 12 luni."
      },
      {
        "t": "p",
        "text": "Baza prelucrării: executarea serviciului solicitat de dumneavoastră."
      },
      {
        "t": "h2",
        "text": "Destinatari și persoane împuternicite"
      },
      {
        "t": "p",
        "text": "Datele pot fi prelucrate de furnizori care acționează la instrucțiunea operatorului. Pentru verificarea sarcinilor și interdicțiilor, numărul cadastral este transmis Agenției de Guvernare Electronică (AGE), în condițiile descrise mai sus. Nu vindem și nu comercializăm datele cu caracter personal."
      },
      {
        "t": "p",
        "text": "Pentru procesarea plăților cu cardul, datele necesare plății (suma, moneda, identificatori ai tranzacției, e-mailul și numele plătitorului, datele cardului introduse în fereastra securizată) sunt prelucrate de:"
      },
      {
        "t": "li",
        "text": "Victoriabank (acquirer);"
      },
      {
        "t": "li",
        "text": "CyberSource / Visa Acceptance Solutions (procesator de plăți), cu infrastructură în Statele Unite ale Americii și Uniunea Europeană."
      },
      {
        "t": "p",
        "text": "Prin urmare, are loc un transfer transfrontalier de date. Acesta se efectuează în scopul executării contractului cu dvs. (procesarea plății) și cu garanțiile asigurate de bancă și de procesatorul de plăți, prin contractele și standardele de securitate aplicabile acestora (inclusiv PCI DSS). Nu este necesar un consimțământ separat pentru acest transfer."
      },
      {
        "t": "h2",
        "text": "Perioada de stocare"
      },
      {
        "t": "p",
        "text": "Datele se păstrează doar pe durata necesară scopurilor pentru care au fost colectate și pe durata relației contractuale, plus termenele impuse de obligațiile legale (de ex. fiscale). Ulterior, datele se șterg sau se anonimizează."
      },
      {
        "t": "li",
        "text": "Tokenul cardului se păstrează cât timp abonamentul este activ sau în perioada de grație și se șterge la încetarea abonamentului, la schimbarea cardului (tokenul anterior) și la ștergerea contului."
      },
      {
        "t": "li",
        "text": "Evidența plăților (suma, data, tipul plății, e-mailul plătitorului din momentul plății) se păstrează 6 ani de la data plății, în baza obligației legale de contabilitate și fiscalitate; în acest interval nu este legată de contul șters."
      },
      {
        "t": "li",
        "text": "Adresa IP și user-agent-ul înregistrate la acordul pentru plată (dovada acordului) se păstrează același termen ca și înregistrarea plății, 6 ani de la data plății."
      },
      {
        "t": "li",
        "text": "Jurnalul de audit se păstrează 12 luni. După ștergerea contului, identificatorul tehnic al utilizatorului rămâne în jurnal, fără nume și e-mail, până la expirarea termenului."
      },
      {
        "t": "h2",
        "text": "Securitatea datelor"
      },
      {
        "t": "p",
        "text": "Aplicăm măsuri tehnice și organizatorice adecvate: control al accesului, criptare, jurnalizare, separarea mediilor, proceduri de gestionare a incidentelor."
      },
      {
        "t": "h2",
        "text": "Drepturile persoanelor vizate"
      },
      {
        "t": "p",
        "text": "Persoana vizată are dreptul la informare, acces, rectificare, ștergere, restricționarea prelucrării, opoziție, portabilitate, dreptul de a nu fi supusă unei decizii bazate exclusiv pe prelucrarea automatizată, precum și dreptul de a-și retrage consimțământul."
      },
      {
        "t": "p",
        "text": "Drepturile se exercită prin cerere la info@biseeth.md. Răspundem în maximum 36 de ore lucrătoare."
      },
      {
        "t": "p",
        "text": "Ștergerea contului este disponibilă direct în Aplicație (Profil). Datele care trebuie păstrate legal (evidența plăților) nu se șterg înainte de termen."
      },
      {
        "t": "h2",
        "text": "Responsabilitatea utilizatorului pentru datele terților"
      },
      {
        "t": "p",
        "text": "Utilizatorul (agentul) garantează că deține un temei legal pentru a încărca în Aplicație date cu caracter personal ale terților (proprietari, cumpărători), inclusiv, după caz, consimțământul acestora, și că respectă legislația privind protecția datelor."
      },
      {
        "t": "h2",
        "text": "Cookie-uri"
      },
      {
        "t": "p",
        "text": "Aplicația poate utiliza cookie-uri și tehnologii similare pentru funcționare, securitate și statistici. Datele colectate anonim înainte de înregistrare (de exemplu, sursa vizitei) pot fi asociate contului dvs. după crearea acestuia, în scopul analizei utilizării platformei."
      },
      {
        "t": "h2",
        "text": "Modificări"
      },
      {
        "t": "p",
        "text": "Prezenta Politică poate fi actualizată. Versiunea în vigoare este publicată în Aplicație. Data ultimei actualizări: 19.11.2026."
      }
    ]
  },
  "termeni": {
    "title": "Termeni și Condiții",
    "blocks": [
      {
        "t": "p",
        "text": "Prezenții Termeni și Condiții reglementează utilizarea aplicației ImoGhid, furnizată de „BlackSpace Tech” SRL. Prin crearea unui cont și utilizarea Aplicației, utilizatorul acceptă acești termeni."
      },
      {
        "t": "h2",
        "text": "Definiții"
      },
      {
        "t": "li",
        "text": "Aplicația: aplicația ImoGhid și serviciile aferente."
      },
      {
        "t": "li",
        "text": "Furnizorul: „BlackSpace Tech” SRL, care operează sub marca comercială BiSeeTh."
      },
      {
        "t": "li",
        "text": "Utilizatorul: persoana care creează un cont (de regulă, agent imobiliar / profesionist)."
      },
      {
        "t": "h2",
        "text": "Descrierea serviciilor"
      },
      {
        "t": "p",
        "text": "Aplicația oferă instrumente de asistare a pregătirii tranzacțiilor imobiliare: verificarea informativă a datelor cadastrale, analiza documentelor, generarea dosarului tranzacției, liste de verificare, calcule, gestionarea anunțurilor prin contul propriu 999.md al utilizatorului și alte funcții conexe."
      },
      {
        "t": "h2",
        "text": "Caracterul informativ al datelor cadastrale"
      },
      {
        "t": "p",
        "text": "Datele cadastrale afișate sunt preluate din sursa oficială (Registrul bunurilor imobile, prin Agenția de Guvernare Electronică, platforma MConnect) și au exclusiv titlu informativ; ele nu produc consecințe juridice. Pentru certitudine juridică este necesar extrasul oficial din Registrul bunurilor imobile. Furnizorul nu garantează exhaustivitatea sau actualitatea datelor furnizate de registru. Verificarea reflectă starea imobilului la momentul interogării, nu înlocuiește extrasul din Registrul bunurilor imobile și nu constituie o concluzie juridică."
      },
      {
        "t": "h2",
        "text": "Caracterul asistiv"
      },
      {
        "t": "p",
        "text": "Rezultatele generate (analiza documentelor, verificări, liste, calcule) au caracter orientativ și nu înlocuiesc verificarea profesională a utilizatorului, a notarului sau a autorităților competente. Utilizatorul rămâne pe deplin responsabil pentru deciziile sale."
      },
      {
        "t": "h2",
        "text": "Integrarea cu 999.md"
      },
      {
        "t": "li",
        "text": "utilizatorul conectează propriul cont 999.md (token propriu); anunțurile sunt publicate în numele utilizatorului;"
      },
      {
        "t": "li",
        "text": "taxele și plățile pentru serviciile 999.md (publicare, promovare) se efectuează din contul utilizatorului și sunt exclusiv în raportul dintre utilizator și operatorul platformei 999.md (Simpals);"
      },
      {
        "t": "li",
        "text": "Furnizorul nu este parte la aceste raporturi și nu intermediază plățile; utilizatorul respectă termenii de utilizare ai 999.md."
      },
      {
        "t": "h2",
        "text": "Obligațiile utilizatorului"
      },
      {
        "t": "p",
        "text": "Utilizatorul răspunde de exactitatea și de legalitatea datelor introduse, inclusiv de deținerea temeiului legal pentru prelucrarea datelor terților (proprietari). Sunt interzise: accesul neautorizat, extragerea automată neautorizată a datelor de pe site-uri terțe, încălcarea termenilor altor platforme și utilizarea Aplicației în scopuri ilicite."
      },
      {
        "t": "h2",
        "text": "Abonament, tarife și plăți"
      },
      {
        "t": "p",
        "text": "Accesul la funcțiile Aplicației se face pe bază de abonament lunar sau prin plată unică („O accesare”). Planurile și tarifele în vigoare sunt afișate în Aplicație înainte de plată: Basic, Pro și HUB/Agenție (pentru agenții, cu preț pe loc și minimum 3 locuri). Tarifele sunt exprimate în lei moldovenești (MDL). Tarifele nu includ TVA, Furnizorul nu este plătitor de TVA."
      },
      {
        "t": "p",
        "text": "Plata se efectuează cu cardul bancar, printr-o fereastră securizată a procesatorului de plăți. Datele complete ale cardului se introduc exclusiv în această fereastră și nu ajung la Furnizor. Plata poate necesita confirmare 3-D Secure din partea băncii emitente. Procesarea plăților este asigurată de Victoriabank și de procesatorul de plăți CyberSource (Visa Acceptance Solutions)."
      },
      {
        "t": "p",
        "text": "Tarifele pot fi modificate cu notificare prealabilă. O modificare a tarifului nu se aplică abonamentului existent fără acordul expres al utilizatorului: dacă nu acceptați noul tarif, abonamentul nu se prelungește la prețul nou."
      },
      {
        "t": "h2",
        "text": "Furnizarea serviciului și acordul la plată"
      },
      {
        "t": "p",
        "text": "Serviciile Aplicației sunt servicii digitale și se furnizează imediat după achitare. Înainte de plată, persoana fizică bifează obligatoriu caseta: „Sunt de acord să primesc serviciul digital imediat după achitare și confirm că am citit și accept Condițiile de plată, Termenii de returnare și Termenii publicați pe site.” Fără această bifare plata nu se efectuează. Bifarea confirmă că ați luat cunoștință de aceste condiții, inclusiv de faptul că suma plătită pentru perioada începută nu se returnează (vezi „Plată și rambursare”), și constituie acordul dvs. pentru începerea imediată a furnizării serviciului."
      },
      {
        "t": "p",
        "text": "Pentru achiziția unui număr mare de locuri, cu preț negociat individual, condițiile și plata (prin transfer bancar, nu cu cardul) se stabilesc printr-un contract separat cu Furnizorul. Planurile HUB/Agenție la tarifele standard afișate în Aplicație se plătesc cu cardul, în condițiile din acest document."
      },
      {
        "t": "h2",
        "text": "Reînnoirea automată (debitare recurentă)"
      },
      {
        "t": "p",
        "text": "Abonamentele lunare se reînnoiesc automat. Prin bifarea acordului la plată, utilizatorul permite Furnizorului să debiteze automat, în fiecare lună, suma indicată în fața acordului, de pe cardul salvat, până la anularea abonamentului. Pentru aceasta, procesatorul de plăți salvează cardul sub formă de token (un identificator care nu permite folosirea cardului în afara ImoGhid)."
      },
      {
        "t": "li",
        "text": "Perioada de abonament este o lună calendaristică de la data plății."
      },
      {
        "t": "li",
        "text": "Debitarea pentru perioada următoare se efectuează cu o zi înainte de încheierea perioadei plătite."
      },
      {
        "t": "li",
        "text": "Cu 3 zile înainte de debitare se trimite un e-mail de reamintire."
      },
      {
        "t": "li",
        "text": "Suma debitată este aceea pentru care ați acordat acordul. Dacă suma se schimbă (tarif nou, modificarea numărului de locuri), se solicită un nou acord, iar fără el debitarea nu se efectuează."
      },
      {
        "t": "li",
        "text": "După fiecare plată reușită primiți un document de plată (chitanță) pe e-mail."
      },
      {
        "t": "h2",
        "text": "Anularea abonamentului"
      },
      {
        "t": "p",
        "text": "Puteți anula abonamentul oricând din Aplicație (Profil, „Anulează abonamentul”). După anulare nu mai au loc debitări, iar accesul se păstrează până la sfârșitul perioadei deja plătite. Cardul salvat (tokenul) se șterge la încetarea accesului. Până la sfârșitul perioadei puteți relua abonamentul."
      },
      {
        "t": "h2",
        "text": "Schimbarea planului"
      },
      {
        "t": "li",
        "text": "Trecerea la un plan superior (de ex. Basic la Pro) se face imediat, cu plata integrală a noului plan și începutul unei perioade noi de la data plății. Suma plătită pentru perioada planului anterior nu se returnează."
      },
      {
        "t": "li",
        "text": "Trecerea la un plan inferior (de ex. Pro la Basic) se aplică de la începutul perioadei următoare; până atunci rămâne planul actual. Programarea poate fi anulată până la data debitării."
      },
      {
        "t": "h2",
        "text": "Abonamentul agenției (HUB/Agenție)"
      },
      {
        "t": "p",
        "text": "Abonamentul agenției se plătește pe loc: număr de locuri × prețul pe loc (minimum 3 locuri), lunar, cu aceleași reguli de reînnoire automată."
      },
      {
        "t": "li",
        "text": "Adăugarea de locuri este disponibilă imediat. Se plătește proporțional cu zilele rămase din perioada curentă (cu un minimum de 10 MDL), iar de la perioada următoare se debitează suma pentru noul număr de locuri, pentru care se solicită un nou acord."
      },
      {
        "t": "li",
        "text": "Reducerea numărului de locuri se aplică de la perioada următoare; nu se returnează nimic. Numărul de locuri nu poate fi mai mic de 3 și nu poate fi mai mic decât numărul de locuri ocupate sau rezervate prin coduri de invitație."
      },
      {
        "t": "li",
        "text": "La anularea abonamentului sau la ștergerea contului administratorului agenției, membrii pierd accesul HUB. La anulare, accesul se păstrează până la sfârșitul perioadei plătite; la ștergerea contului administratorului, accesul membrilor încetează imediat."
      },
      {
        "t": "h2",
        "text": "Eșecul plății"
      },
      {
        "t": "p",
        "text": "Dacă debitarea este respinsă de bancă:"
      },
      {
        "t": "li",
        "text": "în cazul unui refuz definitiv (card expirat, blocat, închis) nu se mai încearcă repetat; primiți un e-mail cu cererea de a actualiza cardul;"
      },
      {
        "t": "li",
        "text": "în cazul unui refuz temporar (fonduri insuficiente, eroare tehnică) se fac încercări repetate după 1, 3 și 5 zile."
      },
      {
        "t": "p",
        "text": "Accesul se păstrează 5 zile după sfârșitul perioadei plătite. Dacă plata nu este reluată în acest termen, planul încetează, iar cardul salvat se șterge. Puteți actualiza cardul oricând din Aplicație („Schimbă cardul”)."
      },
      {
        "t": "h2",
        "text": "Ștergerea contului"
      },
      {
        "t": "p",
        "text": "La ștergerea contului: abonamentele se anulează, cardurile salvate se șterg la procesatorul de plăți, iar datele contului se șterg. Evidența plăților (suma, data, tipul plății, e-mailul din momentul plății) se păstrează 6 ani de la data plății, conform obligațiilor legale de contabilitate și fiscalitate, fără legătură cu contul șters. Ștergerea contului nu produce rambursarea perioadei plătite."
      },
      {
        "t": "h2",
        "text": "Proprietatea intelectuală"
      },
      {
        "t": "p",
        "text": "Aplicația, codul, designul și conținutul propriu aparțin „BlackSpace Tech” SRL și sunt protejate de lege. Utilizatorului i se acordă un drept limitat, neexclusiv, de utilizare."
      },
      {
        "t": "h2",
        "text": "Limitarea răspunderii"
      },
      {
        "t": "p",
        "text": "În limitele permise de lege, Furnizorul nu răspunde pentru deciziile luate de utilizator pe baza informațiilor cu caracter informativ/asistiv, pentru indisponibilitatea temporară a surselor externe (cadastru, 999.md) sau pentru prejudicii indirecte."
      },
      {
        "t": "h2",
        "text": "Disponibilitate și modificări ale serviciului"
      },
      {
        "t": "p",
        "text": "Furnizorul depune eforturi rezonabile pentru disponibilitatea Aplicației, dar nu garantează funcționarea neîntreruptă. Serviciul poate fi actualizat, suspendat pentru întreținere sau modificat."
      },
      {
        "t": "h2",
        "text": "Suspendarea și încetarea"
      },
      {
        "t": "p",
        "text": "Furnizorul poate suspenda sau înceta accesul în caz de încălcare a termenilor. Utilizatorul poate renunța la cont oricând, conform procedurii din Aplicație."
      },
      {
        "t": "h2",
        "text": "Legea aplicabilă și soluționarea litigiilor"
      },
      {
        "t": "p",
        "text": "Acești termeni sunt guvernați de legislația Republicii Moldova. Litigiile se soluționează pe cale amiabilă, iar în lipsa unei soluții, de instanțele competente din Republica Moldova."
      },
      {
        "t": "h2",
        "text": "Modificarea termenilor"
      },
      {
        "t": "p",
        "text": "Termenii pot fi actualizați; versiunea în vigoare se publică în Aplicație. Data ultimei actualizări: 24.11.2026."
      },
      {
        "t": "h2",
        "text": "Plată și rambursare"
      },
      {
        "t": "p",
        "text": "Plată. Accesul la funcțiile Aplicației se face pe bază de abonament. Tarifele, planurile și condițiile de reînnoire sunt indicate în Aplicație; tarifele pot fi modificate cu notificare prealabilă. Plata se efectuează online, cu cardul, prin procesatorul de plăți autorizat. Tarifele nu includ TVA (Furnizorul nu este plătitor de TVA)."
      },
      {
        "t": "p",
        "text": "Serviciu digital furnizat imediat. Serviciul are caracter digital și este furnizat imediat după achitare. La achitare, utilizatorul își exprimă acordul expres pentru începerea imediată a prestării, bifând caseta corespunzătoare. În concordanță cu Legea nr. 105/2003 privind protecția consumatorilor și cu regulile aplicabile contractelor la distanță, dreptul de retragere prevăzut pentru contractele la distanță nu se mai aplică serviciului digital a cărui prestare a început cu acordul expres al consumatorului. Prin urmare, perioada deja achitată nu se rambursează la dezactivarea abonamentului sau la schimbarea planului."
      },
      {
        "t": "p",
        "text": "Rambursări datorate. Rambursarea rămâne datorată în următoarele cazuri: (a) neconformitatea serviciului — mai întâi remediere, iar dacă aceasta nu este posibilă, reducere de preț sau rambursare proporțională; (b) plăți duble, debitări eronate sau erori de facturare imputabile Furnizorului. Aceste drepturi se exercită conform Legii nr. 105/2003."
      },
      {
        "t": "p",
        "text": "Cereri. Cererea se transmite la info@biseeth.md și include datele contului, plata vizată și motivul. Furnizorul răspunde în termen de 5 zile lucrătoare."
      },
      {
        "t": "p",
        "text": "Creditarea sumelor. Atunci când rambursarea este datorată, suma se creditează integral, prin aceeași modalitate de plată utilizată la achitare, fără reținerea vreunui comision în sarcina clientului. Termenul efectiv de creditare depinde de banca emitentă a cardului."
      },
      {
        "t": "p",
        "text": "Dezactivarea abonamentului. La dezactivare în cursul unei perioade deja achitate, accesul continuă până la finalul acesteia, fără restituirea diferenței pentru perioada rămasă."
      },
      {
        "t": "p",
        "text": "Persoane juridice. Pentru clienții persoane juridice, condițiile de plată și rambursare pot fi stabilite printr-un contract separat."
      }
    ]
  }
};
