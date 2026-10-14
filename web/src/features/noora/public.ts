// Public API of the Mini Noora feature.
//   <NooraDock />                       her panel (docked on laptops, a sheet on phones and tablets) and the laptop
//                                       edge tab; mounted once by the shell while the `noora` feature is on
//   useNooraLauncher()                  { shown, open, toggle, props } for a launcher in the shell's own bars
//   <NooraAvatar size />                her face, for a launcher's icon
//   useNooraOpen()                      whether her panel is open
//   useMiniNooraHidden()                whether she is hidden on this device (kept up to date)
//   hideMiniNoora() / showMiniNoora()   hide her, or bring her back (the command palette's "Show Mini Noora")
//   askAboutPaper(paper, from)          open her panel to ask about a past paper's question (IDEA-4): { itemId,
//                                       title, page, question }; she reads that page and the sitting's report
//   useNooraAiReady()                   whether her AI answers can take such a question now
//   questionNumber(raw)                 "Q 2 (b)" as the API takes it ("2(b)"), or null; PAPER_PAGE_MAX
export { NooraDock } from './NooraDock';
export { NooraAvatar } from './NooraAvatar';
export { useNooraLauncher, type NooraLauncher } from './useNooraLauncher';
export { useNooraOpen } from './dock';
export { hideMiniNoora, showMiniNoora, useMiniNooraHidden } from './visibility';
export { askAboutPaper, PAGE_MAX as PAPER_PAGE_MAX, questionNumber, useNooraAiReady, type PaperAsk } from './paper';
