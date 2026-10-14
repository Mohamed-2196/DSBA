// Public API of the Mini Noora feature.
//   <MiniNoora />                       the floating, draggable study helper and her chat card; mounted once by the
//                                       shell while the `noora` feature is on (it also owns her shortcut, ⌘/ or Ctrl+/)
//   askNoora(from?)                     bring her back if she is hidden and open her chat (the command palette)
//   useMiniNooraHidden()                whether she is hidden on this device (kept up to date)
//   hideMiniNoora() / showMiniNoora()   hide her, or bring her back
//   askAboutPaper(paper, from)          open her chat to ask about a past paper's question (IDEA-4): { itemId,
//                                       title, page, question }; she reads that page and the sitting's report
//   useNooraAiReady()                   whether her AI answers can take such a question now
//   questionNumber(raw)                 "Q 2 (b)" as the API takes it ("2(b)"), or null; PAPER_PAGE_MAX
export { MiniNoora } from './MiniNoora';
export { askNoora } from './open';
export { hideMiniNoora, showMiniNoora, useMiniNooraHidden } from './visibility';
export { askAboutPaper, PAGE_MAX as PAPER_PAGE_MAX, questionNumber, useNooraAiReady, type PaperAsk } from './paper';
