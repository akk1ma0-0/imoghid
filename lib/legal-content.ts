// АВТОГЕНЕРАЦИЯ из docs/*.docx (скрипт scripts/gen-legal-content.mjs). Не редактировать вручную —
// при изменении документов перегенерировать. Статический контент для публичных
// страниц /despre /faq /confidentialitate /termeni (без runtime-парсинга .docx).

export type LegalBlock = { t: "h2" | "h3" | "q" | "p" | "li"; text: string };
export type LegalDoc = { title: string; blocks: LegalBlock[] };

export const LEGAL_DOCS: Record<"despre" | "faq" | "confidentialitate" | "termeni", LegalDoc> =
{
  "despre": {
    "title": "Despre ImoGhid",
    "blocks": [
      {
        "t": "p",
        "text": "ImoGhid este o platformă digitală creată pentru agenții imobiliari din Republica Moldova, care asistă pregătirea tranzacțiilor imobiliare: identifică obiectul în baza datelor cadastrale publice, analizează documentele, organizează dosarul tranzacției și ghidează agentul pas cu pas — de la verificarea obiectului până la lista de documente necesare."
      },
      {
        "t": "p",
        "text": "Aplicația aduce într-un singur loc verificarea informativă a datelor cadastrale, analiza documentelor și organizarea muncii agentului, cu respectarea cadrului legal al Republicii Moldova."
      },
      {
        "t": "p",
        "text": "ImoGhid este un produs dezvoltat sub marca comercială BiSeeTh, de „BlackSpace Tech” SRL, în colaborare cu Liudmila Popovscaia, expert în drept imobiliar, care a contribuit la concepția juridică și funcțională a platformei. Contact: liudmila.popovscaia@gmail.com."
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
        "text": "Vă ajută să pregătiți o tranzacție imobiliară: identifică obiectul după adresă sau număr cadastral, afișează datele publice, analizează documentele încărcate și construiește dosarul tranzacției cu liste de verificare."
      },
      {
        "t": "q",
        "text": "Datele cadastrale afișate sunt oficiale?"
      },
      {
        "t": "p",
        "text": "Nu. Ele au titlu informativ și nu produc consecințe juridice. Pentru certitudine juridică se comandă extrasul oficial din Registrul bunurilor imobile."
      },
      {
        "t": "q",
        "text": "De ce am nevoie de un extras dacă văd deja datele?"
      },
      {
        "t": "p",
        "text": "Datele publice arată informații generale și indicatori de tipul „există / nu există” (de ex. interdicții). Detaliile (proprietarul, temeiul dreptului, conținutul grevărilor) se obțin doar prin extrasul oficial."
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
        "text": "[Descrieți planurile și tarifele.] Abonamentul ImoGhid este separat de eventualele taxe ale 999.md."
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
        "text": "Contact: info@biseeth.md."
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
        "t": "h2",
        "text": "Prelucrarea automatizată și inteligența artificială"
      },
      {
        "t": "p",
        "text": "Aplicația utilizează un agent bazat pe inteligență artificială pentru a extrage și verifica informații din documente și pentru a efectua căutări cadastrale. Rezultatele au caracter asistiv și orientativ; Aplicația nu adoptă decizii cu efect juridic exclusiv automatizat, fără intervenție umană. Având în vedere utilizarea unor tehnologii noi, se realizează o Evaluare a impactului asupra protecției datelor (DPIA), conform cadrului legal."
      },
      {
        "t": "h2",
        "text": "Surse externe"
      },
      {
        "t": "li",
        "text": "datele cadastrale provin din sursele publice (e-Cadastru) și au titlu informativ, fără a produce consecințe juridice;"
      },
      {
        "t": "li",
        "text": "integrarea cu 999.md se realizează prin contul propriu al utilizatorului, sub autentificarea (tokenul) acestuia."
      },
      {
        "t": "h2",
        "text": "Destinatari și persoane împuternicite"
      },
      {
        "t": "p",
        "text": "Datele pot fi prelucrate de furnizori care acționează la instrucțiunea operatorului. Nu vindem și nu comercializăm datele cu caracter personal."
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
        "text": "Drepturile se exercită prin cerere la info@biseeth.md."
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
        "text": "Aplicația poate utiliza cookie-uri și tehnologii similare pentru funcționare, securitate și statistici."
      },
      {
        "t": "h2",
        "text": "Modificări"
      },
      {
        "t": "p",
        "text": "Prezenta Politică poate fi actualizată. Versiunea în vigoare este publicată în Aplicație. Data ultimei actualizări: 20.06.2026."
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
        "text": "Datele cadastrale afișate sunt preluate din sursele publice și au exclusiv titlu informativ; ele nu produc consecințe juridice. Pentru certitudine juridică este necesar extrasul oficial din Registrul bunurilor imobile. Furnizorul nu garantează exhaustivitatea sau actualitatea datelor publice."
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
        "text": "Accesul la funcțiile Aplicației se face pe bază de abonament. Tarifele, planurile, condițiile de reînnoire și de rambursare sunt indicate în Aplicație. Tarifele pot fi modificate cu notificare prealabilă."
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
        "text": "Termenii pot fi actualizați; versiunea în vigoare se publică în Aplicație. Data ultimei actualizări: 20.06.2026."
      }
    ]
  }
};
