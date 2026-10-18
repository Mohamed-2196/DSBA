// The kit for the documents edited whole in Manage (Site settings, the guides, the forum's settings, Mini Noora, the
// grades calculator's rules, the summary's words, the newsletter's settings). Only those editors import it, and they
// load with Manage, so it stays out of the `ui` barrel every page uses.
export { DocFrame, ListEditor, RowsEditor, type DocProblem } from './kit';
export { docErrors, hasErrorUnder, type DocErrors, type DocShape } from './errors';
export { newItemId } from './doc';
