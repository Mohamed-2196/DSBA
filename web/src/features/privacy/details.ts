// The privacy notice's facts that only the founder can give, and where Railway keeps the files. The page shows a
// missing one as its placeholder in brackets ("[FULL NAME]"), so the gap can't go unnoticed. Every one is filled
// before students get the address (go-live checklist, J1).
export interface PrivacyDetails {
  /** the day this text went live, as the page prints it: '30 November 2026' */
  updated: string | null;
  /** the person responsible for students' data */
  fullName: string | null;
  /** where students write to ask for their data, a correction or a deletion */
  contactEmail: string | null;
  /** the production bucket's region: where the uploaded files and the backups are */
  bucketRegion: string | null;
}

export const PRIVACY_DETAILS: PrivacyDetails = {
  updated: null,
  fullName: 'Mohamed Alnooh', // founder, 13 Nov 2026: as in the footer
  contactEmail: 'privacy@dsbahub.com', // founder, 15 Nov 2026: no postal address; name and this email only
  bucketRegion: null,
};
