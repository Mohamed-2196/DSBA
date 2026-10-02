// Career Navigator: where to apply. Real employers with a presence in Bahrain.
//
// EVERY FACT HERE HAS A SOURCE. The research log is ./SOURCES.md (employer, URL, where it was confirmed,
// date checked). Before you add or change an entry, confirm it the same way and log it there.
//
// House rules for this file:
//   - `url` is the employer's own careers page or the page of a named programme. Never an individual vacancy
//     (they expire) and never a job board or an aggregator.
//   - A programme `name` appears only if it was seen on the employer's own site or in a reliable news source.
//     Otherwise the offer is { type: 'careers' } with no name.
//   - No deadlines, intake months, salaries, headcounts or eligibility rules. Programmes open and close during
//     the year and each sets its own rules; the card sends the student to the page.
//   - `tracks` are OUR guide to the kind of work the employer is known for (at most two, most relevant first).
//     They are not a list of vacancies, and the board says so.
//
//   id:     lowercase kebab-case. Also the logo file name: public/logos/employers/<id>.png
//   mono:   the initials shown on the neutral tile until the logo file is supplied (plain text, never a mark)
//   offers: [{ type: 'graduate' | 'internship' | 'careers', name? }]
//   cta:    'apply' = the page has the way to apply (a form, an apply button or the address to write to),
//           'programme' = the page describes the programme, 'roles' = a careers page or job search

/** The day every link and programme name below was last checked. Shown under the board. */
export const CHECKED_ON = '2 October 2026';

/** Cards shown before "Show all" is pressed (three rows of four on a wide screen). */
export const INITIAL_COUNT = 12;

export const TRACKS = [
  {
    id: 'data',
    label: 'Data science & analytics',
    short: 'Data & analytics',
    about: 'Analyst and data science teams: SQL, modelling and dashboards.',
    modules: ['programming-data-science', 'business-analytics', 'machine-learning'],
  },
  {
    id: 'business',
    label: 'Business analysis',
    short: 'Business analysis',
    about: 'Work that sits between a business team and its numbers: process, requirements and reporting.',
    modules: ['business', 'business-analytics', 'information-systems'],
  },
  {
    id: 'consulting',
    label: 'Consulting',
    short: 'Consulting',
    about: 'Client projects in small teams: structure the problem, analyse it, present the answer.',
    modules: ['business', 'economics', 'business-analytics'],
  },
  {
    id: 'quant',
    label: 'Quantitative & risk',
    short: 'Quant & risk',
    about: 'Risk, credit and modelling teams in banks, investment firms and the regulator.',
    modules: ['advanced-stats-distribution', 'advanced-stats-inferential', 'econometrics'],
  },
  {
    id: 'markets',
    label: 'Treasury & markets',
    short: 'Treasury & markets',
    about: 'Treasury desks, asset managers, brokers and the exchange.',
    modules: ['economics', 'econometrics', 'asset-pricing'],
  },
  {
    id: 'tech',
    label: 'Technology',
    short: 'Technology',
    about: 'Software, cloud and digital teams.',
    modules: ['programming-data-science', 'information-systems', 'machine-learning'],
  },
];

export const OFFER_TYPES = {
  graduate: { label: 'Graduate programme', plural: 'Graduate programmes' },
  internship: { label: 'Internship', plural: 'Internships' },
  careers: { label: 'Careers page', plural: 'Careers pages' },
};

export const CTA_LABEL = { apply: 'Apply', programme: 'See the programme', roles: 'See open roles' };

// Order matters: the first eight fill the first screen, so they mix sectors and lead with named programmes.
export const EMPLOYERS = [
  {
    id: 'nbb',
    name: 'National Bank of Bahrain',
    mono: 'NBB',
    sector: 'Bank',
    offers: [{ type: 'internship', name: 'EVOLVE' }, { type: 'internship', name: 'THRIVE' }],
    tracks: ['markets', 'quant'],
    why: 'EVOLVE is the bank’s summer internship. THRIVE is a paid internship of 6 to 12 months in a full-time role from day one.',
    url: 'https://nbbonline.com/about/careers/',
    cta: 'roles',
  },
  {
    id: 'citi',
    name: 'Citi',
    mono: 'Ci',
    sector: 'Bank',
    offers: [{ type: 'graduate', name: 'Full Time Analyst Program, Technology' }],
    tracks: ['tech', 'data'],
    why: 'Graduate analysts join Citi’s technology hub in Bahrain to build software, with exposure to cloud and data analytics.',
    url: 'https://jobs.citi.com/early-career-programs',
    cta: 'roles',
  },
  {
    id: 'investcorp',
    name: 'Investcorp',
    mono: 'In',
    sector: 'Investment',
    offers: [{ type: 'internship', name: 'Nemir Kirdar Global Internship Program' }],
    tracks: ['markets', 'business'],
    why: 'Ten weeks inside a global alternative investment firm with an office in Manama, working across its businesses.',
    url: 'https://www.investcorp.com/culture-and-development/',
    cta: 'programme',
  },
  {
    id: 'cbb',
    name: 'Central Bank of Bahrain',
    mono: 'CBB',
    sector: 'Regulator',
    offers: [{ type: 'graduate', name: 'GP15 Graduate Development Program' }],
    tracks: ['quant', 'markets'],
    why: 'Six months of work across the central bank’s directorates, with training sessions delivered by BIBF.',
    url: 'https://www.cbb.gov.bh/careers/',
    cta: 'roles',
  },
  {
    id: 'pwc',
    name: 'PwC Middle East',
    mono: 'PwC',
    sector: 'Audit & consulting',
    offers: [{ type: 'graduate', name: 'Graduate Programme' }],
    tracks: ['consulting', 'business'],
    why: 'Graduate intake across Assurance, Consulting, Deals and Tax & Legal. PwC Middle East has an office in Bahrain.',
    url: 'https://www.pwc.com/m1/en/careers/graduates-and-undergraduates-careers.html',
    cta: 'roles',
  },
  {
    id: 'stc-bahrain',
    name: 'stc Bahrain',
    mono: 'STC',
    sector: 'Telecom',
    offers: [{ type: 'graduate', name: 'jeel ICT Graduate Development Program' }],
    tracks: ['tech', 'data'],
    why: 'A one-year programme with job rotations across core services, fintech, technology and support functions.',
    url: 'https://careers.stc.com.bh/jeelICT',
    cta: 'apply',
  },
  {
    id: 'mumtalakat',
    name: 'Mumtalakat',
    mono: 'Mu',
    sector: 'Sovereign fund',
    offers: [{ type: 'careers' }],
    tracks: ['markets', 'business'],
    why: 'Bahrain’s sovereign wealth fund. Its careers page has routes for graduates and for interns who want a start in investments.',
    url: 'https://www.mumtalakat.bh/careers',
    cta: 'roles',
  },
  {
    id: 'bapco-energies',
    name: 'Bapco Energies',
    mono: 'BE',
    sector: 'Energy',
    offers: [{ type: 'graduate', name: 'Information and Digital Technology Graduate Trainee Program' }],
    tracks: ['tech', 'data'],
    why: 'A one-year programme built on on-the-job learning in the energy group’s information and digital technology teams.',
    url: 'https://www.bapcoenergies.com/information-technology-digital-graduate-trainee-program',
    cta: 'apply',
  },
  {
    id: 'sico',
    name: 'SICO',
    mono: 'SICO',
    sector: 'Investment',
    offers: [{ type: 'internship', name: 'Internship Program' }, { type: 'graduate', name: 'Executive Training Program' }],
    tracks: ['markets', 'quant'],
    why: 'Summer interns see asset management, brokerage, treasury and research. New graduates get six months of training.',
    url: 'https://www.sicobank.com/en/internships',
    cta: 'apply',
  },
  {
    id: 'kpmg',
    name: 'KPMG in Bahrain',
    mono: 'KPMG',
    sector: 'Audit & consulting',
    offers: [{ type: 'internship', name: 'Hussain Kasim Internship' }],
    tracks: ['consulting', 'business'],
    why: 'An internship that places students in the Audit, Tax and Advisory teams of KPMG in Bahrain.',
    url: 'https://kpmg.com/bh/en/careers/hussain-kasim-internship.html',
    cta: 'apply',
  },
  {
    id: 'bahrain-bourse',
    name: 'Bahrain Bourse',
    mono: 'BHB',
    sector: 'Exchange',
    offers: [{ type: 'graduate', name: 'Capital Markets Apprenticeship Programme' }, { type: 'graduate', name: 'Emerging Talents' }],
    tracks: ['markets', 'tech'],
    why: 'Six months of hands-on experience across the stock exchange and Bahrain Clear. Emerging Talents is its two-month graduate training.',
    url: 'https://bahrainbourse.com/en/Investors/InvestorAwareness/capital-market',
    cta: 'apply',
  },
  {
    id: 'benefit',
    name: 'BENEFIT',
    mono: 'Be',
    sector: 'Fintech',
    offers: [{ type: 'internship', name: 'Masar FinTech Internship Program' }],
    tracks: ['tech', 'data'],
    why: 'A summer internship at Bahrain’s payments network, with on-the-job training in data services and payment services.',
    url: 'https://benefit.bh/Application-Forms/Careers',
    cta: 'roles',
  },
  {
    id: 'gib',
    name: 'Gulf International Bank',
    mono: 'GIB',
    sector: 'Bank',
    offers: [{ type: 'internship', name: 'Internship Program, GIB Bahrain' }],
    tracks: ['markets', 'quant'],
    why: 'GIB posts its Bahrain internship on its own careers site, next to its open roles.',
    url: 'https://www.gib.com/en/careers-home-page',
    cta: 'roles',
  },
  {
    id: 'deloitte',
    name: 'Deloitte Middle East',
    mono: 'De',
    sector: 'Audit & consulting',
    offers: [{ type: 'internship', name: 'Tadarab' }],
    tracks: ['consulting', 'data'],
    why: 'Tadarab is its internship for undergraduates and graduates, with client work and training. Deloitte has an office in Bahrain Bay.',
    url: 'https://www.deloitte.com/middle-east/en/careers/explore-your-fit/students/internship-program.html',
    cta: 'apply',
  },
  {
    id: 'bahrain-edb',
    name: 'Bahrain EDB',
    mono: 'EDB',
    sector: 'Public body',
    offers: [{ type: 'graduate', name: 'Graduate Trainee Programme' }],
    tracks: ['business'],
    why: 'A one-year programme of practical work at the Economic Development Board, Bahrain’s investment promotion agency.',
    url: 'https://www.bahrainedb.com/about-us/career-opportunities/graduate-trainee-programme',
    cta: 'programme',
  },
  {
    id: 'batelco',
    name: 'Batelco',
    mono: 'Ba',
    sector: 'Telecom',
    offers: [{ type: 'graduate', name: 'Batelco Graduate Trainee Program' }],
    tracks: ['tech', 'business'],
    why: 'A long-established graduate scheme that mixes telecom training with real tasks under supervision. Batelco is part of Beyon.',
    url: 'https://careers.batelco.com/',
    cta: 'roles',
  },
  {
    id: 'ey',
    name: 'EY',
    mono: 'EY',
    sector: 'Audit & consulting',
    offers: [{ type: 'careers' }],
    tracks: ['consulting', 'data'],
    why: 'Student programmes and entry-level roles go through EY’s early careers board. This link opens its Bahrain careers page.',
    url: 'https://www.ey.com/en_bh/careers',
    cta: 'roles',
  },
  {
    id: 'mckinsey',
    name: 'McKinsey & Company',
    mono: 'Mc',
    sector: 'Consulting',
    offers: [{ type: 'careers' }],
    tracks: ['consulting', 'business'],
    why: 'McKinsey has an office in Manama. Its Middle East careers page lists student paths and entry roles such as Business Analyst.',
    url: 'https://www.mckinsey.com/middle-east/careers',
    cta: 'roles',
  },
  {
    id: 'aws',
    name: 'Amazon Web Services',
    mono: 'AWS',
    sector: 'Technology',
    offers: [{ type: 'careers' }],
    tracks: ['tech', 'data'],
    why: 'AWS runs a cloud region in Bahrain. Its early career page lists internships for students and jobs for recent graduates.',
    url: 'https://www.amazon.jobs/content/en/teams/amazon-web-services/early-career',
    cta: 'roles',
  },
  {
    id: 'zain-bahrain',
    name: 'Zain Bahrain',
    mono: 'Za',
    sector: 'Telecom',
    offers: [{ type: 'internship', name: 'Zain Career Connect' }],
    tracks: ['tech', 'business'],
    why: 'A summer internship for university students in teams such as marketing, customer experience, network operations and digital innovation.',
    url: 'https://careers.zain.com/',
    cta: 'roles',
  },
  {
    id: 'al-salam-bank',
    name: 'Al Salam Bank',
    mono: 'ASB',
    sector: 'Bank',
    offers: [{ type: 'internship', name: 'Annual Summer Internship Program' }],
    tracks: ['quant', 'business'],
    why: 'A long-running summer programme: an induction week, then on-the-job placements across the bank’s departments.',
    url: 'https://www.alsalambank.com/en/careers/',
    cta: 'apply',
  },
  {
    id: 'kfh-bahrain',
    name: 'Kuwait Finance House Bahrain',
    mono: 'KFH',
    sector: 'Bank',
    offers: [{ type: 'internship', name: 'Summer Internship Programme' }],
    tracks: ['quant', 'business'],
    why: 'Hands-on training across a wide range of the bank’s departments, with an induction and a mentor.',
    url: 'https://www.bh.kfh.com/about/careers/',
    cta: 'roles',
  },
  {
    id: 'bisb',
    name: 'Bahrain Islamic Bank',
    mono: 'BisB',
    sector: 'Bank',
    offers: [{ type: 'internship', name: 'Athr Summer Internship Programme' }],
    tracks: ['quant', 'business'],
    why: 'Two months of training across the bank’s departments for university students, working on real projects with experienced staff.',
    url: 'https://www.bisb.com/en/careers',
    cta: 'apply',
  },
  {
    id: 'bank-abc',
    name: 'Bank ABC',
    mono: 'ABC',
    sector: 'Bank',
    offers: [{ type: 'careers' }],
    tracks: ['markets', 'quant'],
    why: 'An international bank headquartered in Bahrain. Its careers page links to its current vacancies.',
    url: 'https://www.bank-abc.com/en/AboutABC/Pages/Culture-Careers.aspx',
    cta: 'roles',
  },
  {
    id: 'bbk',
    name: 'BBK',
    mono: 'BBK',
    sector: 'Bank',
    offers: [{ type: 'careers' }],
    tracks: ['quant', 'business'],
    why: 'One of Bahrain’s retail banks. Its careers page takes general applications through a single form.',
    url: 'https://www.bbkonline.com/careers/',
    cta: 'apply',
  },
  {
    id: 'alba',
    name: 'Alba',
    mono: 'Al',
    sector: 'Industry',
    offers: [{ type: 'internship', name: 'On-the-Job Training (OJT) Programmes' }],
    tracks: ['business'],
    why: 'On-the-job training places university students in operational and support functions at Bahrain’s aluminium smelter.',
    url: 'https://www.albasmelter.com/en/category/careers',
    cta: 'roles',
  },
];

/**
 * The one competition on the board. BIBF is taking participants for it; students ask the programme office
 * how to join, so the card carries no deadline. Its logo tile reuses the CFA slot (public/logos/certs/cfa.png).
 */
export const FEATURED = {
  id: 'cfa-research-challenge',
  kind: 'Competition',
  title: 'CFA Institute Research Challenge 2027',
  organiser: 'CFA Institute',
  mono: 'CFA',
  logo: { kind: 'cert', id: 'cfa' },
  badge: 'BIBF is taking participants',
  blurb: 'Teams of students research a listed company, write an equity research report and present it to judges.',
  note: 'Ask the programme office how to join.',
  url: 'https://www.cfainstitute.org/insights/events/research-challenge',
};

const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]));

/** Track by id, or null. */
export function getTrack(id) {
  return TRACK_BY_ID.get(id) || null;
}

/** The distinct offer types of an employer, in the order graduate, internship, careers. */
export function offerTypes(employer) {
  return Object.keys(OFFER_TYPES).filter((type) => employer.offers.some((o) => o.type === type));
}

/** 'careers.stc.com.bh' from a URL: the host a button opens, shown beside it so students can see where it leads. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
