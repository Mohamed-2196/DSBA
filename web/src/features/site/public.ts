// Public interface of Site settings. Other features, and the shell, import from here only.
//
//   useSite()        the hub's own words and links (GET /site): the footer, About, the sidebar's links to BIBF and the
//                    University, search, the grades calculator and the guides' saved links
//   contributorLine(), copyrightYears(), httpsHref(), notesInLibrary()   reading them
//   <SiteEditor />   Manage → Site settings (admins)
//
// The editing kit the documents edited whole in Manage share (the guides' editor uses it too):
//   <DocFrame />, <ListEditor />, <RowsEditor />, newItemId()   the frame and its save bar, lists of items
//   docErrors(), hasErrorUnder()                                the API's 422 as the editor shows it
export { useSite } from './api';
export { docErrors, hasErrorUnder } from './editor/errors';
export { newItemId } from './editor/doc';
export { DocFrame, ListEditor, RowsEditor, type DocProblem } from './editor/kit';
export { contributorLine, copyrightYears, httpsHref, notesInLibrary, type SiteLinkKey } from './lib/site';
export { SiteEditor } from './SiteEditor';
