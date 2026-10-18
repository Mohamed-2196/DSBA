// Public interface of Site settings. Other features, and the shell, import from here only.
//
//   useSite()        the hub's own words and links (GET /site): the footer, About, the sidebar's links to BIBF and the
//                    University, search, the grades calculator and the guides' saved links
//   contributorLine(), copyrightYears(), httpsHref(), notesInLibrary()   reading them
//   <SiteEditor />   Manage → Site settings (admins)
// The editing kit every document edited whole in Manage shares (DocFrame, ListEditor, ...) is in src/ui (docEditor/).
export { useSite } from './api';
export { contributorLine, copyrightYears, httpsHref, notesInLibrary, type SiteLinkKey } from './lib/site';
export { SiteEditor } from './SiteEditor';
