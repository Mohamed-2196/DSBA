// Public API of the Noora feature: the full page (/noora, routes.tsx loads ./page/NooraPage) and Mini Noora.
//   <MiniNoora />                       the floating, draggable study helper and her chat card, the quick way in;
//                                       mounted once by the shell while the `noora` feature is on (it also owns her
//                                       shortcut, ⌘/ or Ctrl+/, and takes openNoora() to the full page)
//   openNoora(prompt?)                  go to the full page; with a prompt, it is asked at once in a new chat (Home's
//                                       "Ask Noora anything…")
//   askNoora(from?)                     bring her back if she is hidden and open her chat card (the command palette)
//   useMiniNooraHidden()                whether she is hidden on this device (kept up to date)
//   hideMiniNoora() / showMiniNoora()   hide her, or bring her back
//   askAboutPaper(paper, from)          open her chat to ask about a past paper's question: { itemId,
//                                       title, page, question }; she reads that page and the sitting's report
//   useNooraAiReady()                   whether her AI answers can take such a question now
//   questionNumber(raw)                 "Q 2 (b)" as the API takes it ("2(b)"), or null; PAPER_PAGE_MAX
export { MiniNoora } from './MiniNoora';
export { askNoora, openNoora } from './open';
export { hideMiniNoora, showMiniNoora, useMiniNooraHidden } from './visibility';
export { askAboutPaper, PAGE_MAX as PAPER_PAGE_MAX, questionNumber, useNooraAiReady, type PaperAsk } from './paper';
