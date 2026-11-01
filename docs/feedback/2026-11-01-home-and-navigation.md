# Mohamed's feedback on Home and navigation, 2026-11-01

Branch `ux-home-feedback`.

| # | Feedback (his words, trimmed) | What was done |
| --- | --- | --- |
| H-1 | Homepage: simplify it, less is more; a clean landing page with easy access to the other sections | Home's default (Site settings `homeBlocks`, seeded from `api/app/seed/data/site.json`) is now Results day (only around results), Carry on, Up next and A past question a day. The desk shelf in the greeting stays: one tile each for Modules, Notebook, Forum and Calendar. To-do, Continue, Forum, Ask Noora, Help the year below, the newsletter and Daily left the default but stay in Customise Home |
| H-2 | Users can reach modules three ways from Home; one or two would do | Home had the shelf's Modules tile, the My modules block and its "All modules" button. The My modules block is gone (block `modules`, `YourModules.tsx`); Modules in the main navigation and the shelf's Modules tile remain |
| H-3 | Keep the calendar, important dates and Carry on, perhaps A past question a day; remove New files | Kept as above. New files is gone: block `files`, `NewFiles.tsx`, `fileRows.ts`, the shelf's new-files count (`HomeShelf.newFiles`) and its query |
| H-4 | A past question a day by module, choosing chapters; on each module page or a Revision tab | Each module's Overview has "A past question a day": today's question from the chapters the student ticks (all by default), with "Choose chapters" and "Ask it on Home too". Home's card asks the module put there (any day), else the next exam's module in the six weeks before it; "Change" picks the module and its chapters. The choice is kept on the account (`preferences.dailyQuestion`, no migration: preferences are JSON) or in this browser for a guest (`hub.dailyQuestion`), as Home's layout is. API: `GET /library/daily-question?module_id=&chapters=` (the pick moved out of `GET /home`) |
| H-5 | Is the Library page needed, when each module has the same files? | The Library page is gone from the sidebar, the phone's tab bar (Calendar took its place), the shelf, search's pages and Noora's links; `/library` opens Modules (keeping `?upload=1` and `?year=`). Kept: every file's page, practise, flagged questions, Manage → Uploads, search results, requests and notifications. Upload a file opens over the page on screen (on a module page, with that module chosen); a module's Files tab has Upload a file, Add a link (people who manage the library), "Can't find a file? Ask for it" and every file a page at a time. Your uploads and your starred files moved to Account → Your files |
| H-6 | Other pages look good as they are | Unchanged, apart from the links that pointed at the Library page |
| H-7 | Include "Powered by BIBF Innovation Hub" somewhere appropriate | Plain text, small: the sidebar's foot (under the account), the phone's More sheet, the footer of every page and About. Sign-in is a dialog with no page footer, so it has none |

Existing hubs: a hub whose Site settings were never saved gets the new Home at once. One whose settings were saved
keeps its saved layout, less New files and My modules (the seed drops blocks Home no longer has); an admin sets the new
default in Manage → Site settings → Home and the tour. A student who customised Home keeps their layout, less those
two blocks.
