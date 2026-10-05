// Mini Noora's chat: who she is (the header), the conversation, and the composer. It is a dialog
// but not a modal one: the page beside it stays usable. This file is fetched on demand (see
// MiniNoora.jsx) and brings the conversation and her scripted "brain" with it.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { TrayArrowDown, X } from '@phosphor-icons/react';
import { IconButton, cx } from '../../ui';
import { Composer } from './Composer.jsx';
import { Face } from './Face.jsx';
import { MessageList } from './Messages.jsx';
import { addFiles, release, releaseAll } from './files.js';
import { useChat } from './useChat.js';
import './ChatPanel.css';

const CLOSING = 160; // ms the chat takes to fold away (the CSS animation's length)
const WAVE = 2400; // ms she waves when the chat opens

/** Keep the chat in the page for a moment after it closes, so it can animate out. */
function usePresence(open, ms) {
  const [lingering, setLingering] = useState(open);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return undefined;
    }
    const gone = setTimeout(() => setLingering(false), ms);
    return () => clearTimeout(gone);
  }, [open, ms]);
  return open || lingering;
}

/** Her expression in the header, from the reply that is on its way (see useChat for `pending`). */
function faceFor(pending, waving) {
  if (!pending) return waving ? 'wave' : 'neutral';
  if (pending.phase === 'thinking') return 'thinking';
  const { mood, refs } = pending.reply;
  if (mood === 'angry') return 'angry';
  if (mood === 'sad') return 'thinking'; // puzzled: there is no sad portrait
  if (pending.phase === 'done' && refs.length) return 'winking'; // found it
  if (mood === 'laughing') return 'laughing';
  return mood === 'wave' ? 'wave' : 'neutral';
}

/** How she should stand meanwhile: talking until the reply is all there, then pleased or sorry for a moment. */
function poseFor(pending) {
  if (!pending) return null;
  if (pending.phase !== 'done') return 'talking';
  const { mood, refs } = pending.reply;
  if (mood === 'sad') return 'sad';
  if (mood === 'angry') return null; // she has made her point; no little dance after a telling-off
  return refs.length || mood === 'laughing' ? 'happy' : null;
}

/** What a screen reader hears: that she is thinking, then the whole reply at once (not letter by letter). */
function spokenFor(messages, pending) {
  if (pending && pending.phase === 'thinking') return pending.label;
  const last = messages[messages.length - 1];
  if (last.from !== 'noora') return '';
  const where = last.refs && last.refs.length ? ` Where to look: ${last.refs.map((r) => `${r.code}, ${r.label}`).join('; ')}.` : '';
  const working = (last.steps || []).map((s) => s.say).join(' ');
  return `${last.text}${last.formula ? ` ${last.formula.say}` : ''}${working ? ` ${working}` : ''}${where}`;
}

const carriesFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

/**
 * @param id       element id (the mascot's aria-controls points at it)
 * @param open     shown or not; the conversation is kept while it is closed
 * @param place    from layout.js placeChat(): where it goes, and whether it is a phone sheet
 * @param year     the year the student is browsing
 * @param calm     reduced motion
 * @param onClose  close it and hand the keyboard back to her
 * @param onPose   (pose) tells MiniNoora how she should stand: 'talking' | 'happy' | 'sad' | null
 */
export default function ChatPanel({ id, open, place, year, calm, onClose, onPose }) {
  const { messages, pending, busy, send } = useChat({ year, calm });
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState(null);
  const [dropping, setDropping] = useState(false);
  const [waving, setWaving] = useState(false);
  const [newFrom, setNewFrom] = useState(0);
  const present = usePresence(open, calm ? 0 : CLOSING);
  const panel = useRef(null);
  const input = useRef(null);
  const titleId = useId();
  const { sheet } = place;

  const pose = poseFor(pending);
  useEffect(() => {
    onPose(pose);
  }, [pose, onPose]);

  // Opening: she waves, and the keyboard goes to the text box. On a phone it goes to the sheet
  // instead, so the on-screen keyboard only comes up when the student taps the box.
  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => (sheet ? panel.current : input.current)?.focus({ preventScroll: true }));
    setWaving(true);
    const done = setTimeout(() => setWaving(false), WAVE);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [open, sheet]);

  // Messages that arrive while the chat is open come in with a small entrance. Once it has been
  // closed they are old news: they are simply there when it opens again.
  const lastId = messages[messages.length - 1].id;
  useEffect(() => {
    if (!open) setNewFrom(lastId);
  }, [open, lastId]);

  // Leaving for good: let go of every picture, sent or still in the tray.
  useEffect(() => releaseAll, []);

  const attach = (fileList) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    const added = addFiles(files, picked);
    setFiles(added.list);
    setNote(added.note);
  };
  const remove = (file) => {
    release(file);
    setFiles((list) => list.filter((f) => f !== file));
    setNote(null);
  };
  const submit = () => {
    const text = draft.trim();
    if (!text && !files.length) return;
    if (!send({ text, attachments: files })) return; // she is still answering
    setDraft('');
    setFiles([]); // the pictures now belong to the message
    setNote(null);
  };
  const suggest = useCallback((text) => send({ text }), [send]);
  // On a desktop the chat stays open beside the page a link leads to. A phone sheet would hide that page.
  const follow = useCallback(() => {
    if (sheet) onClose();
  }, [sheet, onClose]);

  if (!present) return null;
  return (
    <section
      ref={panel}
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cx('nc', sheet && 'nc--sheet', dropping && 'is-dropping')}
      data-state={open ? 'open' : 'closing'}
      data-side={place.side}
      data-hub="noora-chat"
      style={{ left: place.left, top: place.top, width: place.width, height: place.height, transformOrigin: `${place.origin.x}px ${place.origin.y}px` }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) onClose();
      }}
      onDragEnter={(e) => {
        if (carriesFiles(e)) setDropping(true);
      }}
      onDragOver={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault(); // without this the browser will not let anything be dropped here
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        setDropping(false);
        attach(e.dataTransfer.files);
      }}
    >
      <header className="nc-head">
        <Face bust={faceFor(pending, waving)} size={40} live className="nc-head__face" />
        <div className="nc-head__text">
          <h2 id={titleId} className="nc-head__title">Mini Noora</h2>
          <p className="nc-head__sub">
            <span className="nc-head__dot" aria-hidden="true" />
            Knows your modules
          </p>
        </div>
        <IconButton label="Close chat" icon={X} size="sm" className="nc-head__close" onClick={onClose} />
      </header>

      <div className="nc-body">
        <MessageList messages={messages} pending={pending} newFrom={newFrom} onSuggest={suggest} onFollow={follow} />
        <Composer inputRef={input} draft={draft} onDraft={setDraft} files={files} note={note} busy={busy} onAttach={attach} onRemove={remove} onSend={submit} />
        <p className="nc-foot">Mini Noora is a preview. She answers from the Hub’s module list.</p>
        {/* Always there, shown while files are dragged over the chat. */}
        <div className="nc-drop" data-hub="noora-dropzone" aria-hidden="true">
          <TrayArrowDown weight="duotone" />
          Drop to attach
        </div>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {spokenFor(messages, pending)}
      </p>
    </section>
  );
}
