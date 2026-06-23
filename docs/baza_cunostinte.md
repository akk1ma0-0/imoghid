# ImoGhid / Agent «Gheorghii» — Baza de cunoștințe

Reper pentru analiza tranzacțiilor imobiliare în Republica Moldova

## 01. Registrul actelor normative

| Nr. | Act normativ | Nr./an | Domeniu | Ce reglementează | Statut |
|-----|-------------|--------|---------|-----------------|--------|
| 1 | Codul civil al Republicii Moldova | nr. 1107/2002 | Cadru general | Proprietate și drepturi reale, obligații și contracte (vânzare, donație, schimb, rentă, locațiune, comodat), succesiuni (Cărțile II–IV) | Activ |
| 2 | Legea privind procedura notarială | nr. 246/2018 | Notariat | Forma și conținutul actelor notariale, registre | Activ |
| 3 | Legea cu privire la organizarea activității notarilor | nr. 69/2016 | Notariat | Competență, tarife, arhivă | Activ |
| 4 | Legea cu privire la ipotecă | nr. 142/2008 | Ipotecă | Piața ipotecară primară; validitate/încetare; executare; ipotecă legală și convențională | Activ |
| 5 | Legea Prima Casă | nr. 293/2017 | Ipotecă | Garanție de stat pentru primul credit ipotecar (persoane fizice) | Activ |
| 6 | Legea privind privatizarea fondului de locuințe | nr. 1324/1993 | Privatizare | Privatizarea fondului locativ | Activ — termen prelungit până la 31.05.2029 |
| 7 | Legea privind administrarea și deetatizarea proprietății publice | nr. 121/2007 | Proprietate publică | Proprietate publică | Activ |
| 8 | Legea cadastrului bunurilor imobile | nr. 1543/1998 | Cadastru / RBI | Cadastru și Registrul bunurilor imobile | Activ |
| 9 | HG — Regulament privind înscrierea în RBI | nr. 201/2025 | Cadastru / RBI | Modul de efectuare a înscrierilor în RBI (regulament principal) | Activ (mai 2026) |
| 10 | HG — e-Cadastru, tarife | nr. 130/2025 | Cadastru / Tarife | e-Cadastru; tarife actuale | Activ |
| 11 | HG — Registrul prețurilor bunurilor imobile | nr. 145/2025 | Prețuri / Evaluare | Registrul prețurilor; evaluatorii transmit datele | Activ — lansat 15.02.2026 |
| 12 | Codul fiscal | nr. 1163/1997 | Fiscalitate | Impozit pe imobil, creștere de capital, exproprieri, scutiri | Activ |
| 13 | Ordin AGCC — model de evaluare comercial/industrial | nr. 42/2026 | Fiscalitate / Evaluare | Model de evaluare pentru impozitare | Activ — din 07.05.2026 |
| 14 | Legea privind protecția consumatorilor | nr. 105/2003 | Protecția consumatorilor | Cumpărători persoane fizice | Activ |
| 15 | Legea privind activitatea agenților imobiliari | nr. 40/2026 | Agenți imobiliari | Contract scris obligatoriu, certificare, chitanțe, arhivă | Adoptat — în vigoare 23.01.2027 |
| 16 | Legea privind prevenirea și combaterea spălării banilor și fițării terorismului | nr. 308/2017 | AML / CFT | Identificarea clientului; raport SPCSB în 24h; operațiuni ≥ 200.000 lei numerar | Activ |
| 17 | Legea cu privire la locuințe | nr. 75/2015 | Locuințe | Statutul locuinței, fond, închiriere | Activ |
| 18 | Lege — modificarea cadrului normativ în domeniul locuințelor | nr. 58/2026 | Locuințe | Modificări ale cadrului privind locuințele | Activ — din 09.05.2026 |
| 19 | Legea cu privire la condominiu | nr. 187/2022 | Condominiu | Vânzarea unităților în condominiu | Activ |
| 20 | Codul funciar | nr. 22/2024 | Funciar | Regim, categorii, destinația terenurilor | Activ |
| 21 | Legea privind prețul normativ și modul de vânzare-cumpărare a pământului | nr. 1308/1997 | Funciar | Prețul normativ al pământului | Activ |
| 22 | Codul administrativ | nr. 116/2018 | Litigii | Contestarea refuzurilor de înregistrare sau ale notarului | Activ |
| 23 | Legea medierii | — | Litigii | Medierea litigiilor | Activ |
| 24 | HG — comodat pe teren public | nr. 91/2019 | Proprietate publică | Comodat aplicat terenului public | Activ |

## 02. Reguli de verificare

| Cod | Tip tranzacție | Când se aplică | Ce se verifică | Temei | Nivel |
|-----|---------------|----------------|---------------|-------|-------|
| R1 | Toate înstrăinările | Înstrăinarea unui bun imobil | Formă autentică (notarială) obligatorie | Codul civil 1107/2002; Legea 246/2018 | СТОП |
| R2 | Toate | Înainte de tranzacție | Verifică dreptul vânzătorului: extras RBI, fără grevări, notări, sechestru, ipotecă | Legea 1543/1998 | СТОП |
| R3 | Toate | Interdicții / ipotecă / sechestru pe obiect | Clarifică și, după caz, radiază înainte de tranzacție | RBI; HG 201/2025 | СТОП |
| R4 | Toate | Plată în numerar ≥ 200.000 lei sau operațiune suspectă | Identificarea clientului; notificare SPCSB în 24h | Legea 308/2017 | СТОП |
| R5 | Toate | Parte nerezidentă / persoană juridică străină | Regim valutar, documente suplimentare, fiscalitate — confirmă cu juristul | Codul fiscal; reglementări valutare | СТОП |
| R6 | Ipotecă | Gaj/ipotecă > 1.000.000 lei | Verificare suplimentară — punct de oprire | Legea 142/2008 | СТОП |
| R7 | Succesiuni | Renunțarea la moștenire | Ireversibilă — punct de oprire | Codul civil 1107/2002 | СТОП |
| R8 | Toate | Locuință privatizată recent (≤ 3 ani) | Punct de oprire | Legea 1324/1993 | СТОП |
| R9 | Toate | Cotă-parte în proprietate comună | Dreptul preferențial al coproprietarilor | Codul civil 1107/2002 | СТОП |
| R10 | Toate | Tranzacție între rude apropiate | Risc de recalificare — atenție | Codul fiscal 1163/1997 | Внимание |
| R11 | Toate | Creștere de capital > 100.000 lei | Calculul impozitului — punct de oprire | Codul fiscal 1163/1997 | Внимание |
| R12 | Vânzare-cumpărare | Cumpărător persoană fizică (consumator) | Aplică protecția consumatorului | Legea 105/2003 | Внимание |
| R13 | Donație | Bun imobil donat | Doar formă autentică | Codul civil 1107/2002; Legea 246/2018 | СТОП |
| R14 | Donație | În funcție de gradul de rudenie | Verifică impozitarea donației | Codul fiscal 1163/1997 | Внимание |
| R15 | Donație | După donație | Posibilă revocare (ingratitudine, naștere copil, neexecutare) | Codul civil 1107/2002 | Инфо |
| R16 | Schimb | Mena de imobile | Se aplică normele vânzării fiecărei părți; impozit pe creștere de capital pentru fiecare | Codul civil 1107/2002 | Внимание |
| R17 | Rentă | Înstrăinare cu întreținere pe viață | Formă autentică obligatorie; posibilă rezoluțiune la neexecutare | Codul civil 1107/2002 | СТОП |
| R18 | Locațiune | Termen > 3 ani | Înregistrare în RBI obligatorie + formă autentică | Codul civil 1107/2002 | Внимание |
| R19 | Locațiune | Venit din chirie | Impozit pe venit | Codul fiscal 1163/1997 | Инфо |
| R20 | Locațiune | Locuință | Aplică Legea 75/2015 | Legea 75/2015 | Инфо |
| R21 | Comodat | Folosință gratuită | Înregistrarea / forma autentică, de regulă, neobligatorii (excepție: teren public) | Codul civil 1107/2002; HG 91/2019 | Инфо |
| R22 | Ipotecă | Constituirea ipotecii | Formă autentică + înregistrare în RBI | Codul civil; Legea 142/2008 | СТОП |
| R23 | Ipotecă | Primul credit ipotecar | Garanția de stat Prima Casă, dacă este aplicabilă | Legea 293/2017 | Инфо |
| R24 | Privatizare | Cerere de privatizare | Certificat de neprivatizare, locuire efectivă, statut de locuință | Legea 1324/1993 | Внимание |
| R25 | Privatizare | Spațiu cu destinație nelocativă | Mai întâi schimbarea destinației | Legea 1324/1993 | Внимание |
| R26 | Succesiuni | Acceptarea moștenirii | Termen de 6 luni de la deschiderea succesiunii | Codul civil 1107/2002 | Внимание |
| R27 | Succesiuni | Înregistrarea dreptului | În baza certificatului de moștenitor | Codul civil 1107/2002 | Инфо |
| R28 | Succesiuni | Testament | Verifică rezerva succesorală (cota obligatorie) | Codul civil 1107/2002 | Внимание |
| R29 | Toate | După autentificare | Înregistrare în RBI (dreptul se dobândește la înregistrare) | HG 201/2025; Legea 1543/1998 | Инфо |
| R30 | Toate | Dacă s-a efectuat evaluare | Transmiterea datelor în Registrul prețurilor | HG 145/2025 | Инфо |
| R31 | Toate | Agent imobiliar implicat (din 23.01.2027) | Contract scris, certificare, chitanțe, arhivă | Legea 40/2026 | Внимание |

## 03. Completitudinea dosarului (documente necesare)

| Tip tranzacție | Document | Obligatoriu / condiție |
|---------------|----------|----------------------|
| Vânzare-cumpărare | Extras din RBI (proprietar, grevări) | Obligatoriu |
| Vânzare-cumpărare | Act de proprietate / titlu | Obligatoriu |
| Vânzare-cumpărare | Acte de identitate ale părților | Obligatoriu |
| Vânzare-cumpărare | Consimțământul soțului | Dacă bunul este comun |
| Vânzare-cumpărare | Acordul coproprietarilor | Dacă există cotă-parte |
| Vânzare-cumpărare | Date privind plata / sursa fondurilor | Obligatoriu (AML dacă ≥ 200.000 lei numerar) |
| Vânzare-cumpărare | Raport de evaluare | Dacă este necesar (bancă / fiscal) |
| Ipotecă | Contract de ipotecă | Obligatoriu |
| Ipotecă | Extras RBI (fără grevări) | Obligatoriu |
| Ipotecă | Acord / aviz al băncii | Obligatoriu |
| Ipotecă | Raport de evaluare | Obligatoriu |
| Ipotecă | Documente Prima Casă | Dacă este aplicabil |
| Privatizare | Cerere către organul local | Obligatoriu |
| Privatizare | Certificat de neprivatizare | Obligatoriu |
| Privatizare | Confirmarea locuirii efective | Obligatoriu |
| Privatizare | Materiale cadastrale | Obligatoriu |
| Privatizare | Confirmarea statutului de locuință | Obligatoriu |
| Succesiuni | Certificat de deces | Obligatoriu |
| Succesiuni | Acte de rudenie / testament | Obligatoriu |
| Succesiuni | Extras RBI al bunului | Obligatoriu |
| Succesiuni | Certificat de moștenitor | Se eliberează de notar |
| Donație | Act de proprietate / titlu | Obligatoriu |
| Donație | Extras RBI | Obligatoriu |
| Donație | Acte de identitate | Obligatoriu |
| Donație | Consimțământul soțului | Dacă bunul este comun |
| Donație | Confirmarea gradului de rudenie | Pentru impozitare |

## 04. Puncte de oprire (escaladare la specialist)

| Cod | Situație | De ce se oprește | Temei |
|-----|---------|-----------------|-------|
| P1 | Înainte de autentificarea finală la notar | Ultima verificare a pachetului | — |
| P2 | Plată în numerar > 200.000 lei | AML/CFT | Legea 308/2017 |
| P3 | Nerezident / persoană juridică străină | Regim valutar, fiscalitate, documente suplimentare | — |
| P4 | Gaj sau ipotecă > 1.000.000 lei | Risc ridicat | Legea 142/2008 |
| P5 | Renunțarea la moștenire | Ireversibilă | Codul civil 1107/2002 |
| P6 | Locuință privatizată recent (≤ 3 ani) | Risc | Legea 1324/1993 |
| P7 | Tranzacție între rude apropiate | Risc de recalificare | Codul fiscal 1163/1997 |
| P8 | Cotă în proprietate comună | Dreptul preferențial al coproprietarilor | Codul civil 1107/2002 |
| P9 | Impozit pe creștere de capital > 100.000 lei | Verificarea calculului | Codul fiscal 1163/1997 |


## 05. Acte normative suplimentare (din baza Agentului 06)

| Nr. | Act normativ | Nr./an | Domeniu | Ce reglementează | Statut |
|-----|-------------|--------|---------|-----------------|--------|
| 23 | Legea cu privire la condominiu | nr. 187/2022 | Condominiu | Vânzarea unităților în condominiu | Activ |
| 24 | Codul funciar | nr. 22/2024 | Funciar | Regim, categorii, destinația terenurilor | Activ |
| 25 | Legea privind prețul normativ și modul de vânzare-cumpărare a pământului | nr. 1308/1997 | Funciar | Prețul normativ al pământului | Activ |
| 26 | Lege privind modificarea cadrului normativ în domeniul locuințelor | nr. 58/2026 | Locuințe | Modificări ale cadrului privind locuințele | Activ — din 09.05.2026 |
| 27 | Legea medierii | — | Litigii | Medierea disputelor imobiliare | Activ |

## 06. Scenarii tipice de tranzacție (algoritmi)

### Vânzare-cumpărare
- Verifică dreptul vânzătorului: extras RBI, fără grevări, notări, sechestru, ipotecă
- Verifică: impozit pe creșterea de capital, regim rezidențial, AML
- Formă autentică obligatorie (Legea 246/2018)
- Dacă plată numerar ≥ 200.000 lei → notificare SPCSB (Legea 308/2017)
- Înregistrare în RBI după autentificare (HG 201/2025)

### Donație
- Formă autentică obligatorie (Codul civil 1107/2002, Legea 246/2018)
- Consecințe fiscale: impozit în funcție de gradul de rudenie (Codul fiscal 1163/1997)
- Rude apropiate → scutire; alte persoane → impozit
- Posibilitate de revocare: ingratitudine, nașterea unui copil, neexecutarea obligației

### Schimb
- Se aplică normele vânzării pentru fiecare parte (Codul civil 1107/2002)
- Ambele părți sunt simultan vânzători și cumpărători
- Impozit pe creșterea de capital pentru fiecare parte separat

### Rentă viageră / Contract de întreținere pe viață
- Transmiterea bunului imobil în schimbul întreținerii pe viață
- Regim: Codul civil — contractul de înstrăinare cu condiția întreținerii pe viață
- Posibilitate de rezoluțiune la neexecutare
- Formă notarială obligatorie

### Locațiune (arendă)
- Locuință sau spațiu nelocativ; termen; obiect; preț
- Norme generale: Codul civil 1107/2002
- Locuință → Legea 75/2015
- Înregistrare în RBI obligatorie dacă termenul > 3 ani
- Formă notarială obligatorie dacă se înregistrează în RBI
- Impozit: НДФЛ din plata chiriei (Codul fiscal)

### Ipotecă
- Ipotecă convențională (prin contract) și legală (prin lege)
- Lege: Codul civil 1107/2002 + Legea 142/2008
- Formă notarială + înregistrare în RBI obligatorie
- Prima Casă (Legea 293/2017) — garanție de stat pentru primul credit ipotecar
- Executare silită — procedură separată

### Privatizare
- Termen: Legea 1324/1993 — prelungit până la 31.05.2029
- Condiții: locuire efectivă, fără privatizare anterioară (certificat de neprivatizare)
- Cale standard: cerere la primărie → verificare → decizie → contract → înregistrare RBI
- Contestare la refuz: Codul administrativ 116/2018

### Moștenire (succesiuni)
- Baza: Cartea IV Codul civil 1107/2002
- Termen de acceptare: 6 luni de la deschiderea succesiunii (data decesului)
- Tipuri: succesiunea legală (clase de moștenitori) sau testamentară
- Rezerva succesorală — cotă obligatorie protejată
- Partajul — împărțirea masei succesorale între moștenitori
- Document final: certificat de moștenitor (emis de notar)
- Înregistrare drepturi în RBI pe baza certificatului

## 07. Puncte de oprire extinse

| Cod | Situație | De ce se oprește | Temei |
|-----|---------|-----------------|-------|
| P1 | Înainte de autentificarea finală la notar | Ultima verificare a pachetului | — |
| P2 | Plată în numerar > 200.000 lei | AML/CFT | Legea 308/2017 |
| P3 | Nerezident / persoană juridică străină | Regim valutar, fiscalitate, documente suplimentare | — |
| P4 | Tranzacție cu ipotecă > 1.000.000 lei | Verificare suplimentară bancă/notar | Legea 142/2008 |
| P5 | Renunțare la moștenire | Acțiune ireversibilă | Codul civil 1107/2002 |
| P6 | Bun imobil privatizat ≤ 3 ani anterior | Risc de contestare | Legea 1324/1993 |
| P7 | Tranzacție între rude apropiate | Risc de reîncadrare fiscală | Codul fiscal 1163/1997 |
| P8 | Cotă în proprietate comună | Drept de preemțiune al coproprietarilor | Codul civil 1107/2002 |
| P9 | Impozit pe creșterea de capital > 100.000 lei | Calcul exact — contabil/notar | Codul fiscal 1163/1997 |
