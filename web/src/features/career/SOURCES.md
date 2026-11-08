# Career Navigator: research log

Everything on the Career Navigator page that names a real organisation, programme or URL is listed here with
where it was confirmed. **Every entry was first checked on 2 October 2026 and re-checked on 8 November 2026.** What
the re-check changed, added or removed is in "Re-check of 8 November 2026" below, with its source; the tables after it
describe the page as it is now. The data now lives in the API's Career
Navigator document (`api/app/seed/data/career.json`, served by `GET /api/v1/career` and edited by admins with
`PUT /api/v1/career`): its `employers`, `featured`, `certs`, `furtherStudy` and the notes. Update this log whenever an entry changes.

## How the checking was done

- **Loaded** means the page itself was opened and read on the day (title, headings and the relevant text). It was
  read through an automated fetch tool, not in a person's browser, and the quotes below are as that tool returned
  them. A human click-through of each link is still worth doing once.
- **Index only** means the page refused an automated visit (a bot block or a robots rule), so the URL and its
  title come from the search index. These are the ones to click through by hand before the film is captured.
- Programme names come from the employer's own site wherever possible. Where the name comes from a news report,
  the report is named.
- The employers' cards state no deadline, intake month or salary. The note under them says many programmes are for
  Bahraini nationals only, which eight of the employers' own pages state (8 Nov 2026), and tells students to read
  each page's rules. The further-study list is the one place with dates: each is copied from the course's or
  scholarship's own page, and they need re-checking every autumn.
- Something the re-check couldn't confirm on the organisation's own site (a programme named only in the news, a
  year the page doesn't give) stays off the page until it can be.
- "Tracks" (Data science & analytics, Business analysis, Consulting, Quantitative & risk, Treasury & markets,
  Technology) are an editorial guide to the kind of work each employer is known for, at most two per employer.
  They are not claims about vacancies, and the footnote on the page says so.

## Re-check of 8 November 2026

Every link on the page was opened again on 8 November 2026 (in a browser where a site refuses automated visits).
What changed:

| Entry | Change | Source (8 Nov 2026) |
| --- | --- | --- |
| `checkedOn` | "2 October 2026" → "8 November 2026" | This re-check |
| Bahrain EDB (`bahrain-edb`) | Removed | Every careers link redirects to the home page; see "Looked at and left off" |
| Central Bank of Bahrain (`cbb`) | Text: BIBF no longer named | CBB release, 11 June 2026 |
| stc Bahrain (`stc-bahrain`) | Button: "Apply" → "See the programme" | careers.stc.com.bh/jeelICT: "No vacancies were found" |
| Bapco Energies (`bapco-energies`) | Adds the Empower Internship Program | bapcoenergies.com/empower-program |
| SICO (`sico`) | New link; button → "See the programme" | Old link 404; sicobank.com/internship has no form |
| Bahrain Bourse (`bahrain-bourse`) | Button → "See the programme" | Its application form returns 404 |
| Gulf International Bank (`gib`) | New link; Careers page instead of a programme; text | Old link 404; no Bahrain internship posted |
| EY (`ey`) | Names the Consulting Graduate Program; text | EY early careers board, Bahrain |
| Al Salam Bank (`al-salam-bank`) | New link | /en/careers/ redirects to /about/careers/ |
| Gulf Air (`gulf-air`) | New employer | gulfair.com/careers; Gulf Air media centre, 22 Sept 2026 |
| Information & eGovernment Authority (`iga`) | New employer | iga.gov.bh programme page |
| Singapore Gulf Bank (`sgb`) | New employer | sgb.com, 3 Sept 2026 |
| Bahrain Commercial Facilities Company (`bcfc`) | New employer | bcfc.bh news, 14 July 2026 |
| CFA Research Challenge (`featured`) | Badge and note: this season's teams are set | Competition rules; kickoff 8 Oct 2026 |
| Financial analyst, Presenting step | "next season" | As above |
| Google Data Analytics (`google-da`) | Link → its Coursera page | grow.google redirects from Bahrain |
| `certNote` | Adds Tamkeen's Tamakkan funding | Tamakkan Certificates Catalogue, July 2026 |
| `employersNote` | Adds the nationality rule and Tamkeen's National Employment Program | Eight employers' pages; tamkeen.bh |
| `furtherStudy` | A dated list of six courses and scholarships, and a line on Chevening | See "Further study" |

The other entries were found as described below. Programme names and facts known only from news reports, and
anything the re-check couldn't confirm (Bapco's window year, BIBF's CFA team, Mazad), were left off the page.

## Employers on the page (29)

| #   | Employer (id)                                | URL the button opens                                                                              | How checked                                                                                          | What was confirmed, and where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | National Bank of Bahrain (`nbb`) | https://nbbonline.com/about/careers/ | **Index only** (page returns 403 to automated visits; listed in the search index as "Careers - NBB") | EVOLVE is "the Bank's flagship summer internship programme" and THRIVE is "six-month training that offers participating students full-time work experience": Gulf Daily News, 29 June 2026 (gdnonline.com/Details/1399017). News of Bahrain, 9 July 2026 (loaded): "the 2026 edition of EVOLVE, its flagship summer internship programme". NBB's own site has "Thrive Application - NBB" (nbbonline.com/thrive-application/) and EVOLVE news pages in the search index (index only). The GDN article loaded once and showed a CAPTCHA on a second visit. |
| 2 | Citi (`citi`) | https://jobs.citi.com/early-career-programs | Loaded ("Early Career, Citi Careers") | Posting "Technology - Application Development, Full Time Analyst, Seef - Bahrain 2026" on jobs.citi.com (loaded): location Seef, Manama; describes "The Analyst Program"; work includes application development with exposure to cloud and data analytics. Citi's Bahrain technology hub: The National, 27 Sept 2021, and Bahrain EDB news. |
| 3 | Investcorp (`investcorp`) | https://www.investcorp.com/culture-and-development/ | Loaded | "In 2022, we launched a global internship program honoring our founder's legacy, the Nemir Kirdar Global Internship Program. The 10-week journey immerses talented young minds from the US, Europe, GCC, and Asia in the heart of Investcorp's diverse businesses." Careers email on the same page (no application form, so the button says "See the programme"). Manama office (Investcorp House) listed on investcorp.com. 2024 edition page also loaded. |
| 4 | Central Bank of Bahrain (`cbb`) | https://www.cbb.gov.bh/careers/ | Loaded (lists current openings; says the CBB recruits graduates) | "GP15 Graduate Development Program": six months across CBB directorates: CBB press release on Zawya, 31 March 2026. Second cohort (1 Oct 2026 to 31 Mar 2027, Bahraini graduates of 2024–26, GPA 3.25 or more; applications 15 Jun to 31 Jul 2026): CBB release, 11 June 2026 (cbb.gov.bh/?p=112003, loaded 8 Nov 2026). That release doesn't mention BIBF, so the card no longer says BIBF delivers the training (8 Nov 2026). |
| 5 | PwC Middle East (`pwc`) | https://www.pwc.com/m1/en/careers/graduates-and-undergraduates-careers.html | Loaded ("Graduates and undergraduates careers") | Lines of service on the page: Assurance, Consulting, Deals, Internal Firm Services, Tax and Legal Services. "Graduate Programme" is PwC's own name (pwc.com job titles such as "Assurance, Graduate Programme 2026 - Middle East"). Bahrain is one of the 12 countries PwC Middle East lists. |
| 6 | stc Bahrain (`stc-bahrain`) | https://careers.stc.com.bh/jeelICT | Loaded (8 Nov 2026: "No vacancies were found") | "jeel ICT", "stc's flagship Graduate Development Program": 12 months, job rotations, areas "Core Services, Emerging Services, FinTech, Technology, Support Functions". On 8 Nov 2026 the page had no open vacancy and its rules covered Bahraini graduates of 2023–2025, so the button says "See the programme" until a new edition opens. |
| 7 | Mumtalakat (`mumtalakat`) | https://www.mumtalakat.bh/careers | Loaded | Sections "Graduates" and "Interns" ("ideal for those seeking to explore or embark on a career in the field of investments"). No named programme, so the card says Careers page. |
| 8 | Bapco Energies (`bapco-energies`) | https://www.bapcoenergies.com/information-technology-digital-graduate-trainee-program | Loaded (8 Nov 2026; the site blocks some automated visits) | "Information and Digital Technology Graduate Trainee Program": "a one-year program ... on-the job learning experience and development"; for Bahraini nationals aged 20–25 who graduated in the past three years with a GPA of 3.0 or more, for a January 2027 start (8 Nov 2026). The page gives an application window without a year, so no date is on our card. "Empower Internship Program": an eight-week summer internship matched to the student's major, on bapcoenergies.com/empower-program (its 2026 window was 29 Apr to 7 May 2026; read through a search tool's copy of the page dated 16 Oct 2026, as the site blocks automated visits). |
| 9 | SICO (`sico`) | https://sicobank.com/internship | Loaded (8 Nov 2026; linked from sicobank.com/careers) | The old link (sicobank.com/en/internships) returned 404 on 8 Nov 2026. The new page has the same two programmes: "SICO's two-month summer internship program ... asset management, investment banking, brokerage, market making, treasury and research" and "six-month executive training program ... new graduates", for Bahraini nationals with a GPA of 2.8 or more. It has no application form ("Contact us"), so the button says "See the programme". |
| 10 | KPMG in Bahrain (`kpmg`) | https://kpmg.com/bh/en/careers/hussain-kasim-internship.html | Loaded | "Hussain Kasim Internship program", across "Audit, Tax and Advisory functions". Also linked from kpmg.com/bh/en/careers.html (loaded). |
| 11 | Bahrain Bourse (`bahrain-bourse`) | https://bahrainbourse.com/en/Investors/InvestorAwareness/capital-market | Loaded | "The intensive six-months Capital Markets Apprenticeship Program" gives "hands-on experience by gaining a comprehensive understanding of Bahrain Bourse and Bahrain Clear operations". "Emerging Talents", a two-month graduate training programme: Bahrain Bourse news, 2 Sept 2026 (loaded). The programme's application form returned 404 on 8 Nov 2026, so the button says "See the programme". General careers page: bahrainbourse.com/en/careers (loaded, CV by email). |
| 12 | BENEFIT (`benefit`) | https://benefit.bh/Application-Forms/Careers | Loaded (open positions and CV submission) | "Masar" FinTech Internship Program: benefit.bh news (fourth edition, loaded); "on-the-job training in data services, payment services, and corporate support": BENEFIT press release on Zawya (second edition). Fifth edition reported by Bahrain This Week and Biz Bahrain. |
| 13 | Gulf International Bank (`gib`) | https://www.gib.com/en/careers-home-page.html | Loaded in a browser (8 Nov 2026) | The old link (without .html) returned 404 on 8 Nov 2026. The careers page links to a job search, which showed one job, in Khobar, and no Bahrain internship. GIB ran a Bahrain internship in 2022 (gib.com news), 2024 and 2025 (postings "Internship Program 2024 - GIB Bahrain" and "Internship Program 2025 - GIB Bahrain" on careers.gib.com), so the card now says it has run one in past years and shows Careers page, not a programme. |
| 14 | Deloitte Middle East (`deloitte`) | https://www.deloitte.com/middle-east/en/careers/explore-your-fit/students/internship-program.html | Loaded | "Tadarab, the Deloitte Middle East internship program ... for graduate and undergraduate students", with client work and learning programmes. Manama office (United Tower, Bahrain Bay): deloitte.com office locator (loaded). |
| 15 | Batelco (`batelco`) | https://careers.batelco.com/ | Loaded ("Careers at Bahrain Telecommunication Company") | Section "Batelco Graduate Trainee Program": a "long established Graduate Trainee program"; posting says blended telecom and employability training. Beyon is the parent group (beyon.com/careers, loaded, points to this site). |
| 16 | EY (`ey`) | https://www.ey.com/en_bh/careers | Loaded (8 Nov 2026); the early careers board (eyglobal.yello.co) read in a browser | EY's early careers board, filtered to Bahrain, lists "EY Bahrain Consulting Graduate Program" (nationals, degree within the last 18 months), an audit graduate opening (Bahraini, accounting, GPA 3 or more) and an audit work-experience programme (8 Nov 2026). The postings show a day and month but no year. |
| 17 | McKinsey & Company (`mckinsey`) | https://www.mckinsey.com/middle-east/careers | Loaded | Lists Manama among its Middle East locations, "Career paths for students" and roles including Business Analyst. Manama office address on mckinsey.com/middle-east/manama (loaded). No named programme, so the card says Careers page. |
| 18 | Amazon Web Services (`aws`) | https://www.amazon.jobs/content/en/teams/amazon-web-services/early-career | Loaded ("AWS Early Career") | "Internships for students" and "Jobs for recent graduates". AWS Middle East (Bahrain) Region: AWS News Blog "Now Open - AWS Middle East (Bahrain)". No named programme, so the card says Careers page. |
| 19 | Zain Bahrain (`zain-bahrain`) | https://careers.zain.com/ | Loaded ("Zain Careers", has a Zain Bahrain filter and intern roles) | "Zain Career Connect" summer internship for university students in "marketing, customer experience, network operations, human resources, and digital innovation": StartUp Bahrain, 28 July 2025; News of Bahrain. Zain's own page on the internship is in the search index but renders only with JavaScript. |
| 20 | Al Salam Bank (`al-salam-bank`) | https://www.alsalambank.com/about/careers/ | Loaded (8 Nov 2026; the old /en/careers/ link redirects here) | Annual summer internship programme: alsalambank.com news, 18 Sept 2024 (18th edition, loaded); 20th edition, 1 Jul to 31 Aug 2026 with 50 students, an induction week and departmental placements: the bank's release of 21 July 2026 and News of Bahrain, 20 July 2026. |
| 21 | Kuwait Finance House Bahrain (`kfh-bahrain`) | https://www.bh.kfh.com/about/careers/ | Loaded | "2025 Summer Internship Programme": "hands-on professional training across a wide range of departments", with induction and mentorship: bh.kfh.com news, 3 Aug 2025 (loaded). |
| 22 | Bahrain Islamic Bank (`bisb`) | https://www.bisb.com/en/careers | Loaded (application form) | "Athr" Summer Internship Programme: two months across departments for university students, real projects "under the guidance of experienced professionals": The24x7News, 9 July 2026; Bahrain This Week. BisB's own news pages on its summer training are in the search index. |
| 23 | Bank ABC (`bank-abc`) | https://www.bank-abc.com/en/AboutABC/Pages/Culture-Careers.aspx | Loaded ("Culture & Careers") | Links to its current vacancies portal (bankabc.applytojob.com). No current named programme confirmed, so the card says Careers page. |
| 24 | BBK (`bbk`) | https://www.bbkonline.com/careers/ | Loaded (general application form) | No current named programme confirmed, so the card says Careers page. |
| 25 | Alba (`alba`) | https://www.albasmelter.com/en/category/careers | Loaded (links to careers.albasmelter.com, also loaded) | "On-the-Job Training (OJT) Programmes" giving "hands-on experience across operational and support functions", mostly to trainees from Bahrain-based universities: albasmelter.com news, 25 Aug 2025 (loaded). |
| 26 | Gulf Air (`gulf-air`) | https://www.gulfair.com/careers | Loaded (8 Nov 2026: "Begin your career with Gulf Air") | The careers page names the Trainee Engineers programme for Bahraini nationals. The two-month summer internship, run with Bahrain Airport Company, with 135 university students in 2026 and counted towards graduation: Gulf Air media centre, 22 Sept 2026 ("Over 230 Participants Complete Gulf Air and Bahrain Airport Company Talent Development Programmes"); TradeArabia, 23 Sept 2026. The internship has no name on the card: Gulf Air's pages describe it but the careers page doesn't name it. |
| 27 | Information & eGovernment Authority (`iga`) | https://www.iga.gov.bh/en/category/the-technical-development-program | Loaded (8 Nov 2026) | "Technical Development Program": a year of paid on-the-job training in iGA's technical departments for Bahraini graduates aged 21–30 in IT, computer science "or a related field", registered as job seekers. Batch 3 registration: iga.gov.bh, 14 April 2025 (closed 30 May 2025); no batch 4 announced by 8 Nov 2026, so the button says "See the programme". iGA's AI Talent Program is for partner universities only (iga.gov.bh, 17 Feb 2026) and BIBF isn't one, so it isn't on the card. |
| 28 | Singapore Gulf Bank (`sgb`) | https://www.sgb.com/insights/2026-internship-programme | Loaded (8 Nov 2026) | "SGB welcomes Bahraini University graduates to its 2026 graduate internship programme" (3 Sept 2026): three months across banking and finance, digital finance, operations, business development and risk management. No apply route on the page, so the button says "See the programme". |
| 29 | Bahrain Commercial Facilities Company (`bcfc`) | https://www.bcfc.bh/en/about-bcfc/careers/ | Loaded (8 Nov 2026: "Careers at BCFC", links to its vacancies portal) | "Bidaya", its summer training programme for 2026, "hosts university students and recent graduates from a number of local and international universities", two months from 1 July 2026, with rotation across departments: bcfc.bh news, 14 July 2026 (bcfc.bh/en/news/bedya-2026/, loaded 8 Nov 2026). |

## The competition

| Item                                  | URL                                                             | How checked | What was confirmed                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CFA Institute Research Challenge 2027 | https://www.cfainstitute.org/insights/events/research-challenge | Loaded      | "This annual global equity research competition provides university students with hands-on mentoring and intensive training in financial analysis"; teams of three to five students produce a written report and a presentation; local rounds are judged by CFA society members. The official rules PDF is titled "2026-2027 season". |

The badge and note were re-checked on 8 November 2026. The 2026–27 Bahrain round is run by CFA Society Bahrain and
must finish by 1 March 2027 (the competition's 2026–27 rules). Its kickoff was on 8 October 2026 at Bahrain Bourse
(University College of Bahrain news, 8 Oct 2026), and members register within two weeks of the kickoff (rules 2.1c,
2.2a, 2.3a). So a student reading "BIBF is taking participants" in November couldn't join: the badge now says "This
season's teams are set" and the note points to next season. Whether BIBF has a team this season was seen only in a
search snippet of a CFA Society Bahrain post, so the card doesn't say. No deadline is shown. Financial analyst's
"Presenting" step was changed to match ("next season").

## Certificates and courses (7 with an official page)

| Certificate (id)                                | Official URL                                                                                  | How checked | What was confirmed                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CFA Program (`cfa`)                             | https://www.cfainstitute.org/programs/cfa-program                                             | Loaded      | Three levels; the charter also needs relevant work experience.                                                                                                                                                           |
| FRM (`frm`)                                     | https://www.garp.org/frm                                                                      | Loaded      | Two exam parts (Part I and Part II); certification also needs relevant work experience.                                                                                                                                  |
| Power BI Data Analyst, PL-300 (`pl300`)         | https://learn.microsoft.com/en-us/credentials/certifications/data-analyst-associate/          | Loaded      | "Microsoft Certified: Power BI Data Analyst Associate", exam PL-300; skills: prepare the data, model the data, visualize and analyze the data, manage and secure Power BI.                                               |
| AWS Certified Cloud Practitioner (`aws-ccp`)    | https://aws.amazon.com/certification/certified-cloud-practitioner/                            | Loaded      | Foundational level; "validates foundational, high-level understanding of AWS Cloud, services, and terminology".                                                                                                          |
| Google Data Analytics Certificate (`google-da`) | https://www.coursera.org/professional-certificates/google-data-analytics | Loaded (8 Nov 2026) | No experience required; covers spreadsheets, SQL, Python and Tableau, now in nine courses with some AI tools. **Link changed on 8 Nov 2026:** from Bahrain, grow.google/certificates/data-analytics/ redirects to the Arabic Grow with Google home page (grow.google/intl/mena/), not the certificate, so the button opens the certificate's Coursera page. |
| Tableau certification (`tableau`)               | https://www.tableau.com/learn/certification                                                   | Loaded      | The exams are now "Salesforce Certified Tableau Desktop Foundations" (foundational), "Tableau Data Analyst" (advanced) and others; "Tableau certifications are now part of the new Salesforce certification experience". |
| Bloomberg Market Concepts (`bmc`)               | https://professional.bloomberg.com/products/bloomberg-terminal/education/certificate-courses/ | Loaded      | "A self-paced, e-learning course that provides an interactive introduction to the financial markets using the power of the Terminal." New on the page (the brief suggested it).                                          |

"SQL practice" is self-study with no issuer; it opens the library, filtered to the module with the SQL notes.

The note above the certificates says Bahraini job seekers can get some of them paid for by Tamkeen's Tamakkan
programme, and names CFA, FRM and AWS Cloud Practitioner as on its approved list. Source: Tamkeen's Tamakkan
Certificates Catalogue, July 2026 (tamkeen.bh/wp-content/uploads/2026/07/TAMKEEN-CERTIFICATES-CATALOGUE_JUL.pdf, read
in full on 8 Nov 2026), which lists CFA Levels I to III, FRM and AWS Certified Cloud Practitioner (and not PL-300,
Tableau, Google or Bloomberg), and Tamkeen's page on Tamakkan (15 July 2026): 100% of training costs for job seekers
within the programme's caps, 70% for employed people, Bahraini nationals only. Whether a full-time student counts as a
job seeker was not confirmed, so the note says "job seekers".

No prices, pass marks or exam dates appear on the page. "Already in DSBA" on each card comes from the module
catalogue (`GET /api/v1/modules`), as before.

## The note under the employers

- "Many are for Bahraini nationals only": the pages of Bapco Energies, SICO, stc Bahrain, Bahrain Bourse, KPMG, EY,
  NBB (THRIVE) and the CBB (GP15) each say their programme is for Bahrainis (8 Nov 2026). None of the pages on the
  board says it is open to other nationalities.
- Tamkeen's National Employment Program: Tamkeen pays part of a newly hired Bahraini graduate's salary for up to five
  years; graduates with 24 months' experience or less; the employer applies, within six months of the start date.
  Source: tamkeen.bh/en/programs/national-employment-program-3-0, read through a search tool's copy of the page dated
  7 Nov 2026 (tamkeen.bh blocks automated visits). Added on 8 Nov 2026.

## Further study (added 8 November 2026)

The further-study line lists courses and scholarships with their dates, each linking to its own page. All dates are
for entry in 2027 and were read on 8 November 2026. Re-check them every autumn.

| Entry | URL | How checked | What was confirmed |
| --- | --- | --- | --- |
| Gates Cambridge Scholarship | https://www.gatescambridge.org/apply/timeline/ | Loaded | Deadline for most international applicants "dependent on your course – either Tuesday 8th December 2026 or Wednesday 6th January 2027". Full-cost scholarships for applicants from outside the UK to a Cambridge postgraduate course. |
| MBZUAI master's, Abu Dhabi | https://mbzuai.ac.ae/study/graduate-admission-process/ | **Index only** (the site blocks automated visits) | The admissions page, as the search index shows it: final deadline 15 December 2026, 5 pm GST, decisions by 31 March 2027; admission doesn't guarantee a scholarship. Programmes include Statistics and Data Science. Some programmes (Computational Biology, Applied AI) close later. |
| KAUST MS, Saudi Arabia | https://admissions.kaust.edu.sa/how-to-apply/admission-timelines | Loaded | "Round 2 application deadline 3 January 2027"; "These dates are tentative". KAUST Fellowship: tuition up to USD 35,000 a year, a USD 20,000 stipend for MS students and housing (admissions.kaust.edu.sa/fees-funding, loaded). |
| Erasmus Mundus: CoDaS | https://codas.dice.aalto.fi/admission.html | Loaded | "The application period for studies starting in Autumn 2027 runs from 1 December 2026 to 5 January 2027"; scholarship decisions for selected students. Communications Engineering and Data Science, led by Aalto. |
| HBKU MSc Data Science and Engineering, Qatar | https://www.hbku.edu.qa/en/graduate-admissions | Loaded | "Admission application deadline for international graduate applicants 01 Feb 2027". Entry: a bachelor's in "computer science, information systems, engineering, mathematics and related fields", GPA 3.0 (hbku.edu.qa/en/cse/admission-requirements). Funding for international students wasn't confirmed, so the line doesn't mention any. |
| AlMabarrah AlKhalifia Foundation postgraduate scholarship | https://mkfbh.org/ | Loaded | "A distinguished postgraduate scholarship awarded to outstanding Bahraini students, enabling them to pursue Master's and PhD degrees at prestigious international universities" (the "Employees 23 and above" pathway). The site shows no date. Its name (Tamayaz) and an April window appear only in news reports, so neither is on the page. |
| Chevening (the line in the text) | https://www.chevening.org/scholarships/who-can-apply/ | Loaded | Bahrain isn't on the list of eligible countries (the list goes "Bahamas, Bangladesh, Barbados"; Oman is listed). |

## Looked at and left off the page

| Organisation or programme                                 | Why it was left off                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GIB "Jammaz Al-Suhaimi Graduate Programme"                | It is on GIB's careers home page, but the programme page does not say which country it runs in. GIB's card names only the Bahrain internship.                                                                                                                                                                                                                              |
| Bank ABC "Global Internship Programme"                    | Announced on bank-abc.com in July 2023 for recent graduates. No later edition was found, so the name is not on the card.                                                                                                                                                                                                                                                   |
| KFH Bahrain "Wa'ed" Graduate Trainee Program              | Older news on kfh.bh; no current edition was found.                                                                                                                                                                                                                                                                                                                        |
| Zain Bahrain graduate schemes                             | Only the summer internship was confirmed.                                                                                                                                                                                                                                                                                                                                  |
| Kearney, BCG and other strategy firms                     | No Bahrain office or Bahrain programme was confirmed in this pass.                                                                                                                                                                                                                                                                                                         |
| Bloomberg for Education portal                            | Blocked to automated visits; the Bloomberg Professional page above is used for BMC instead.                                                                                                                                                                                                                                                                                |
| Bahrain EDB (`bahrain-edb`), on the page until 8 Nov 2026 | Removed on 8 Nov 2026. The card's link (bahrainedb.com/about-us/career-opportunities/graduate-trainee-programme), /career-opportunities and /edb-internship-programme all redirect to the home page, and the rebuilt site has no careers pages. Its Graduate Trainee Programme and EDB Internship Programme were seen only in a cached copy (30 Oct 2026). Add it back if EDB publishes careers pages again. |
| BBK "NextGen by BBK" and "Grow" | Named in news reports (GDN, 11 July 2026; Al Bayan, 5 July 2026; News of Bahrain, 9 July 2025) but not on bbkonline.com, so the BBK card keeps "Careers page" (8 Nov 2026). |
| stc Bahrain "emerge" Summer Internship | Named only in news reports (third edition in 2026), not on stc's own site (8 Nov 2026). |
| Mazad "Elevate" Summer Internship | A paid eight-week internship, 2026 window closed 15 June 2026: TradeArabia, 3 June 2026, and Mazad's release on Zawya. mazad.app refuses automated visits (403, 8 Nov 2026), so it wasn't seen on Mazad's own site. Add once someone opens its careers page by hand. |
| Bahrain Bourse TradeQuest | A stronger local competition (a BIBF team won the university category in 2025–26), but the 28th edition hadn't been announced on 8 Nov 2026. Add it as a second card once Bahrain Bourse announces it. |
| Ithmaar Bank, Solidarity, BNET, talabat Bahrain, Bahrain Development Bank, Khaleeji Bank internships | 2026 or 2025 editions found mostly in news reports, some with no careers page. Left off until a 2027 edition shows on their own sites (8 Nov 2026). |
| Bapco Energies NBH Future Energy Leaders (postgraduate track) | Its deadline (30 Nov 2026) appears only in a search summary of a news report; Bapco's page blocks automated visits (8 Nov 2026). |
| Gulf programmes outside Bahrain (BlackRock, Goldman Sachs, GCC Interconnection Authority and others) | The page covers Bahrain. Most Gulf programmes checked are for their own nationals, and the open-looking ones don't state work-permit rules (8 Nov 2026). |

## Things to re-check by hand before the film

1. Open the NBB careers link once (index only, see row 1).
2. Programme pages change through the year. A quick click through the first twelve cards (the ones on the first
   screen) on the morning of the capture is cheap insurance.
3. Mazad's careers page (mazad.app, 403 to automated visits) and the year of Bapco Energies' graduate trainee
   window: open each in a normal browser before adding them.
4. If a logo is supplied for the CFA slot (`public/logos/certs/cfa.png`), it shows on both the CFA Program card and
   the Research Challenge card beside the page title.

## Checked by hand on 2 Oct 2026 (evening)

- **NBB**: https://nbbonline.com/about/careers/ opened in a real browser ("Careers - NBB"). The page describes the
  Thrive Programme as a paid internship of 6 to 12 months in a full-time role and has a general application; EVOLVE
  is not named on that page (press sources only). The card text was corrected to match.
