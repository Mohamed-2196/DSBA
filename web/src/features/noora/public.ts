// Public API of the Mini Noora feature.
//   <NooraDock />                       her panel (docked on laptops, a sheet on phones and tablets) and the laptop
//                                       edge tab; mounted once by the shell while the `noora` feature is on
//   useNooraLauncher()                  { shown, open, toggle, props } for a launcher in the shell's own bars
//   <NooraAvatar size />                her face, for a launcher's icon
//   useNooraOpen()                      whether her panel is open
//   useMiniNooraHidden()                whether she is hidden on this device (kept up to date)
//   hideMiniNoora() / showMiniNoora()   hide her, or bring her back (the command palette's "Show Mini Noora")
export { NooraDock } from './NooraDock';
export { NooraAvatar } from './NooraAvatar';
export { useNooraLauncher, type NooraLauncher } from './useNooraLauncher';
export { useNooraOpen } from './dock';
export { hideMiniNoora, showMiniNoora, useMiniNooraHidden } from './visibility';
