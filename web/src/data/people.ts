// DSBA Hub: the people and links behind the site. The contributors and the students who shared notes are real
// people; they are credited on the footer and the About page.
// Public-repo rule: never invent quotes or content attributed to real tutors or staff.

export const REPO_URL = 'https://github.com/Mohamed-2196/DSBA';
/** Where a problem with the Hub itself is reported (About's "Report a problem", decision D6). */
export const REPORT_PROBLEM_URL = `${REPO_URL}/issues/new`;
export const MYCLASS_URL = 'https://myclass.bibf.com';
export const UOL_PORTAL_URL = 'https://my.london.ac.uk/group/student';
export const LAUNCH_YEAR = 2024;
export const COPYRIGHT_HOLDER = 'Mohamed Alnooh';
export const DISCLAIMER =
  'A student-run project. Not affiliated with or endorsed by the University of London. All linked materials belong to their respective owners.';

export interface Contributor {
  id: string;
  name: string;
  role: string;
  affiliation: string | null;
  url: string | null;
}

/** The footer's contributors, in the footer's order. */
export const CONTRIBUTORS: Contributor[] = [
  {
    id: 'mohamed-alnooh',
    name: 'Mohamed Alnooh',
    role: 'Creator and maintainer',
    affiliation: null,
    url: 'https://github.com/Mohamed-2196',
  },
  {
    id: 'feras-alsadadi',
    name: 'Feras Alsadadi',
    role: 'Historical past exams',
    affiliation: null,
    url: null,
  },
  {
    id: 'yaser-alghsara',
    name: 'Yaser Alghsara',
    role: 'Lecture recordings',
    affiliation: 'BIBF faculty',
    url: null,
  },
  {
    id: 'sayed-hasan-kadhem',
    name: 'Dr. Sayed Hasan Kadhem',
    role: 'Lecture recordings',
    affiliation: 'BIBF faculty',
    url: null,
  },
];

export interface NoteContributor {
  id: string;
  name: string;
  notes: { moduleId: string; name: string; url: string }[];
}

/** Students who shared notes (from the modules' notes), in order of first appearance. */
export const NOTE_CONTRIBUTORS: NoteContributor[] = [
  {
    id: 'mahdi',
    name: 'Mahdi',
    notes: [
      { moduleId: 'economics', name: 'Mahdi', url: 'https://drive.google.com/drive/folders/1YkMc0eGzvphYu1i3wGeo1w7d4B2F_I1_' },
      { moduleId: 'information-systems', name: 'Mahdi', url: 'https://drive.google.com/drive/folders/1HbOmDlowIBqImfoWlN7ss2EOImXtMxxM' },
    ],
  },
  {
    id: 'mohamed-hasan',
    name: 'Mohamed Hasan',
    notes: [{ moduleId: 'economics', name: 'Mohamed Hasan', url: 'https://drive.google.com/drive/folders/14skhlfQ72aXUaQEyKk5VefBlPou5mfuY' }],
  },
  {
    id: 'feras',
    name: 'Feras',
    notes: [{ moduleId: 'business', name: 'Feras full revision', url: 'https://drive.google.com/file/d/1H37pHRqBIbPuqN5e17KRmvChuPF2iHbP/view' }],
  },
  {
    id: 'nasser',
    name: 'Nasser',
    notes: [{ moduleId: 'statistics', name: 'Nasser', url: 'https://drive.google.com/drive/folders/1qcIgZ8MzS_2IyIICyCY6JChfHJj4OsCi' }],
  },
  {
    id: 'mariam-nasser',
    name: 'Mariam Nasser',
    notes: [{ moduleId: 'statistics', name: 'Mariam Nasser', url: 'https://drive.google.com/drive/folders/1dvdGf86_7AyhMuxNzzd7ORnG4QIH_BmV' }],
  },
  {
    id: 'mohamed',
    name: 'Mohamed',
    notes: [
      { moduleId: 'advanced-stats-distribution', name: 'Mohamed study guide', url: 'https://drive.google.com/file/d/1T0enLYVk9CZhcnYOhsXRwpP2IU9V45mG/view?usp=drive_link' },
      { moduleId: 'business-analytics', name: 'Mohamed', url: 'https://drive.google.com/file/d/1hq0iMegUQ1zq-zAkSuZyCt06g9Vrf68y/view?usp=drive_link' },
    ],
  },
];
