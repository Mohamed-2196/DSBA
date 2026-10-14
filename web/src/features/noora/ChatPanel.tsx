// Mini Noora's chat: who she is (the header and its actions), the conversation, and the composer. It fills the panel
// that NooraDock.tsx places (docked beside the page on a laptop, a sheet on a phone or tablet). This file is fetched
// on demand and brings the conversation and her scripted "brain" with it.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { matchPath, useLocation } from 'react-router-dom';
import { ArrowCounterClockwise, ArrowsInLineHorizontal, ArrowsOutLineHorizontal, EyeSlash, TrayArrowDown, X } from '@phosphor-icons/react';
import type { NooraStatus } from '../../api/types';
import { useAuth } from '../../auth';
import { useOpenNote } from '../notes/public';
import { useYear } from '../../state';
import { useModules } from '../../state/modules';
import { ConfirmDialog, IconButton, cx } from '../../ui';
import { NOORA_STATUS_KEY, useNooraStatus } from './ai';
import { Composer, type NoteChoice } from './Composer';
import type { DockWidth } from './dock';
import { Face } from './Face';
import { addFiles, release, releaseAll, type Attachment } from './files';
import { MessageList } from './Messages';
import type { Bust } from './sprites';
import { pageSuggestions } from './suggestions';
import type { Message } from './types';
import { useChat, type ChatAi, type Pending } from './useChat';
import './ChatPanel.css';

const WAVE = 2400; // ms she waves when the chat opens
const NOTE_MAX = 20_000; // characters of a note her AI reads (the API's limit)

/** Her expression in the header, from the reply that is on its way (see useChat for `pending`). */
function faceFor(pending: Pending | null, waving: boolean): Bust {
  if (!pending) return waving ? 'wave' : 'neutral';
  if (pending.phase === 'thinking') return 'thinking';
  const { mood, refs } = pending.reply;
  if (mood === 'angry') return 'angry';
  if (mood === 'sad') return 'thinking'; // puzzled: there is no sad portrait
  if (pending.phase === 'done' && refs.length) return 'winking'; // found it
  if (mood === 'laughing') return 'laughing';
  return mood === 'wave' ? 'wave' : 'neutral';
}

/** What a screen reader hears: that she is thinking, then the whole reply at once (not letter by letter). */
function spokenFor(messages: Message[], pending: Pending | null): string {
  if (pending && pending.phase === 'thinking') return pending.label;
  const last = messages[messages.length - 1];
  if (!last || last.from !== 'noora') return '';
  const notice = last.notice ? `${last.notice} ` : '';
  const where = last.refs.length ? ` Where to look: ${last.refs.map((r) => `${r.code}, ${r.label}`).join('; ')}.` : '';
  const working = (last.steps ?? []).map((s) => s.say).join(' ');
  return `${notice}${last.text}${last.formula ? ` ${last.formula.say}` : ''}${working ? ` ${working}` : ''}${where}`;
}

const carriesFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files');

export interface ChatPanelProps {
  /** shown or not; the conversation is kept while it is closed */
  open: boolean;
  /** a sheet on a phone or tablet (else docked beside the page) */
  sheet: boolean;
  /** reduced motion */
  calm: boolean;
  /** the panel (focused when a sheet opens, so the keyboard only comes up when the box is tapped) */
  panelRef: RefObject<HTMLElement>;
  /** docked: its width and the switch between the two; null on a sheet */
  width: DockWidth | null;
  onWidth: (width: DockWidth) => void;
  /** the composer took focus */
  onComposerFocus: () => void;
  /** close it and hand the keyboard back to the launcher */
  onClose: () => void;
  /** a "Where to look" link was followed */
  onFollow: () => void;
  /** hide her on this device */
  onHide: () => void;
}

export default function ChatPanel({ open, sheet, calm, panelRef, width, onWidth, onComposerFocus, onClose, onFollow, onHide }: ChatPanelProps) {
  const { year } = useYear();
  const { pathname, search } = useLocation();
  const { modules } = useModules();
  const { featureOn, me } = useAuth();

  // Her AI: for signed-in, active students while `noora.ai` is on and it can answer (else her script answers).
  const aiOn = featureOn('noora.ai') && me?.status === 'active' && !me.needsProfile;
  const status = useNooraStatus(aiOn);
  const aiReady = aiOn && status.data?.available !== false;
  const openNote = useOpenNote();
  const [withNote, setWithNote] = useState(false);
  const qc = useQueryClient();
  const screen = useRef({ pathname, search, year, openNote, withNote });
  useEffect(() => {
    screen.current = { pathname, search, year, openNote, withNote };
  });
  const ai = useMemo<ChatAi | null>(
    () =>
      aiReady
        ? {
            modules,
            question: (text, history) => {
              const now = screen.current;
              const lesson = matchPath('/modules/:moduleId/lessons/:lessonId', now.pathname)?.params;
              const moduleId = lesson?.moduleId ?? matchPath('/modules/:moduleId', now.pathname)?.params.moduleId ?? null;
              const note = now.withNote && now.openNote ? { title: now.openNote.title, body: now.openNote.body.slice(0, NOTE_MAX) } : null;
              return {
                question: text,
                route: `${now.pathname}${now.search}`.slice(0, 300),
                year: now.year,
                moduleId,
                lessonId: lesson?.lessonId ?? null,
                note,
                history,
              };
            },
            onAnswered: (left) => qc.setQueryData<NooraStatus>(NOORA_STATUS_KEY, (old) => (old ? { ...old, questionsLeft: left } : old)),
          }
        : null,
    [aiReady, modules, qc],
  );
  const { greeting, messages, pending, busy, aiPaused, send, clear } = useChat({ year, calm, ai });
  const usingAi = ai !== null && !aiPaused;
  // "Include my note": offered while a note with words in it is open; ticked for one question at a time.
  const noteChoice: NoteChoice | null =
    usingAi && openNote && openNote.body.trim()
      ? { title: openNote.title.trim() || 'Untitled note', checked: withNote, long: openNote.body.length > NOTE_MAX, onChange: setWithNote }
      : null;
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [waving, setWaving] = useState(false);
  const [newFrom, setNewFrom] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  // Questions for the page the student is on.
  const pageChips = useMemo(() => pageSuggestions({ pathname, year, modules, isOn: featureOn }), [pathname, year, modules, featureOn]);

  // Opening: she waves, and the keyboard goes to the text box. On a sheet it goes to the panel instead, so the
  // on-screen keyboard only comes up when the student taps the box.
  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => (sheet ? panelRef.current : input.current)?.focus({ preventScroll: true }));
    setWaving(true);
    const done = setTimeout(() => setWaving(false), calm ? 0 : WAVE);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [open, sheet, calm, panelRef]);

  // Messages that arrive while the chat is open come in with a small entrance. Once it has been closed they are
  // old news: they are simply there when it opens again.
  const lastId = messages[messages.length - 1]?.id ?? 0;
  useEffect(() => {
    if (!open) setNewFrom(lastId);
  }, [open, lastId]);

  // Leaving for good: let go of every picture, sent or still in the tray.
  useEffect(() => releaseAll, []);

  const attach = (fileList: FileList | null) => {
    const picked = Array.from(fileList ?? []);
    if (!picked.length) return;
    const added = addFiles(files, picked);
    setFiles(added.list);
    setNote(added.note);
  };
  const remove = (file: Attachment) => {
    release(file);
    setFiles((list) => list.filter((f) => f !== file));
    setNote(null);
  };
  const submit = () => {
    const text = draft.trim();
    if (!text && !files.length) return;
    if (!send({ text, attachments: files })) return; // she is still answering
    setWithNote(false); // the note goes with one question only
    setDraft('');
    setFiles([]); // the pictures now belong to the message
    setNote(null);
  };
  const suggest = useCallback((text: string) => void send({ text }), [send]);
  const startAgain = () => {
    clear();
    setConfirming(false);
    input.current?.focus({ preventScroll: true });
  };

  const wide = width === 'wide';
  return (
    <div
      className={cx('nc', dropping && 'is-dropping')}
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
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setDropping(false);
      }}
      onDrop={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        setDropping(false);
        attach(e.dataTransfer.files);
      }}
    >
      <header className="nc-head">
        <Face bust={faceFor(pending, waving)} size={36} live className="nc-head__face" />
        <div className="nc-head__text">
          <h2 className="nc-head__title">
            Mini Noora
          </h2>
          <p className="nc-head__sub">
            <span className="nc-head__dot" aria-hidden="true" />
            {usingAi ? 'Knows your modules and this page' : 'Knows your modules'}
          </p>
        </div>
        <div className="nc-head__actions">
          <IconButton
            label="Clear chat"
            icon={ArrowCounterClockwise}
            size="sm"
            tooltip
            disabled={!messages.length && !pending}
            onClick={() => setConfirming(true)}
            data-hub="noora-clear"
          />
          {width ? (
            <IconButton
              label={wide ? 'Make the panel narrower' : 'Make the panel wider'}
              icon={wide ? ArrowsInLineHorizontal : ArrowsOutLineHorizontal}
              size="sm"
              tooltip
              onClick={() => onWidth(wide ? 'narrow' : 'wide')}
              data-hub="noora-width"
            />
          ) : null}
          <IconButton label="Hide Mini Noora" icon={EyeSlash} size="sm" tooltip onClick={onHide} data-hub="noora-hide" />
          <IconButton label="Close chat" icon={X} size="sm" tooltip onClick={onClose} data-hub="noora-close" />
        </div>
      </header>

      <div className="nc-body">
        <MessageList greeting={greeting} messages={messages} pending={pending} pageChips={pageChips} newFrom={newFrom} onSuggest={suggest} onFollow={onFollow} />
        <Composer
          inputRef={input}
          draft={draft}
          onDraft={setDraft}
          files={files}
          note={note}
          noteChoice={noteChoice}
          busy={busy}
          onAttach={attach}
          onRemove={remove}
          onSend={submit}
          onFocus={onComposerFocus}
        />
        <p className="nc-foot" data-hub="noora-foot">
          {usingAi
            ? `Answers come from Claude, an AI, and can be wrong. Your questions and notes aren’t stored: only how many you ask.${status.data ? ` ${status.data.questionsLeft} left today.` : ''} Pictures stay in this browser.`
            : 'She answers from the Hub’s modules and calendar. What you send her stays in this browser.'}
        </p>
        {/* Always there, shown while files are dragged over the chat. */}
        <div className="nc-drop" data-hub="noora-dropzone" aria-hidden="true">
          <TrayArrowDown weight="duotone" />
          Drop to attach
        </div>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {spokenFor(messages, pending)}
      </p>

      <ConfirmDialog
        open={confirming}
        title="Clear the chat?"
        body="Your messages and her answers go. You can’t get them back."
        confirmLabel="Clear chat"
        tone="danger"
        onConfirm={startAgain}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
