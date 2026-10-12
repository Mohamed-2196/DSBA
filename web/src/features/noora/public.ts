// Public API of the Mini Noora feature.
//   <MiniNoora />                    the floating study helper; mounted once by the shell
//   useMiniNooraHidden()             whether she is hidden on this device (kept up to date)
//   hideMiniNoora() / showMiniNoora()  hide her, or bring her back (the command palette's "Show Mini Noora")
export { MiniNoora } from './MiniNoora';
export { hideMiniNoora, showMiniNoora, useMiniNooraHidden } from './visibility';
