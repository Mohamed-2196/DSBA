// Mini Noora's chat: a calm card with her name and face at the top, the conversation as plain blocks of text, and a
// slim composer. MiniNoora.tsx places it (beside her, or a sheet on a phone). This file is fetched on demand and
// brings the conversation and her scripted "brain" with it.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { matchPath, useLocation } from 'react-router-dom';
import { ArrowCounterClockwise, DotsThree, EyeSlash, TrayArrowDown, X } from '@phosphor-icons/react';
import type { NooraStatus } from '../../api/types';
import { useAuth } from '../../auth';
import { useOpenNote } from '../notes/public';
import { useYear } from '../../state';
import { useModules } from '../../state/modules';
import { ConfirmDialog, IconButton, Menu, cx } from '../../ui';
import { NOORA_STATUS_KEY, useNooraStatus } from './ai';
import { Composer, type NoteChoice, type PaperChoice } from './Composer';
import { Face } from './Face';
import { addFiles, release, releaseAll, type Attachment } from './files';
import { MessageList } from './Messages';
import { clearPaperAsk, usePaperAsk } from './paper';
import type { Bust } from './sprites';
import type { ChatMood } from './poses';
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

/** How she stands beside the chat (poses.ts), from the same reply. */
function moodFor(pending: Pending | null, waving: boolean): ChatMood | null {
  if (!pending) return waving ? 'wave' : null;
  if (pending.phase === 'thinking') return 'thinking';
  if (pending.phase === 'typing') return 'talking';
  return pending.reply.mood === 'sad' || pending.reply.mood === 'angry' ? 'sad' : 'happy';
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
  /** a sheet on a phone (else a card beside her) */
  sheet: boolean;
  /** reduced motion */
  calm: boolean;
  /** the card (focused when a sheet opens, so the keyboard only comes up when the box is tapped) */
  panelRef: RefObject<HTMLElement>;
  /** close it and hand the keyboard back to the launcher */
  onClose: () => void;
  /** a "Where to look" link was followed */
  onFollow: () => void;
  /** hide her on this device */
  onHide: () => void;
  /** how she should stand while the chat is open */
  onMood: (mood: ChatMood | null) => void;
}

export default function ChatPanel({ open, sheet, calm, panelRef, onClose, onFollow, onHide, onMood }: ChatPanelProps) {
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
  const { paper, asked } = usePaperAsk();
  const qc = useQueryClient();
  const screen = useRef({ pathname, search, year, openNote, withNote, paper });
  useEffect(() => {
    screen.current = { pathname, search, year, openNote, withNote, paper };
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
                paper: now.paper ? { itemId: now.paper.itemId, page: now.paper.page, question: now.paper.question } : null,
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
  // A paper's question from the file viewer: it goes with every question until the student takes it off. Asking
  // about one fills the box once.
  const paperChoice: PaperChoice | null = usingAi && paper ? { ...paper, onRemove: clearPaperAsk } : null;
  const [filledFor, setFilledFor] = useState(0);
  if (asked !== filledFor) {
    setFilledFor(asked);
    if (paper) setDraft(`Help me with question ${paper.question}.`);
  }
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

  const mood = moodFor(pending, waving);
  useEffect(() => {
    onMood(open ? mood : null);
  }, [open, mood, onMood]);

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
    clearPaperAsk();
    setConfirming(false);
    input.current?.focus({ preventScroll: true });
  };

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
        <Face bust={faceFor(pending, waving)} size={32} live className="nc-head__face" />
        <div className="nc-head__text">
          <h2 className="nc-head__title">Mini Noora</h2>
          <p className="nc-head__sub">{pending && pending.phase !== 'done' ? 'Answering…' : usingAi ? 'Knows your modules and this page' : 'Knows your modules'}</p>
        </div>
        <Menu
          align="end"
          className="nc-menu"
          label="Chat options"
          trigger={<IconButton label="Chat options" icon={DotsThree} size="sm" data-hub="noora-more" />}
          items={[
            { id: 'clear', label: 'Clear chat', icon: ArrowCounterClockwise, disabled: !messages.length && !pending, onSelect: () => setConfirming(true) },
            { id: 'hide', label: 'Hide Mini Noora', icon: EyeSlash, onSelect: onHide },
          ]}
        />
        <IconButton label="Close chat" icon={X} size="sm" onClick={onClose} data-hub="noora-close" />
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
          paperChoice={paperChoice}
          busy={busy}
          onAttach={attach}
          onRemove={remove}
          onSend={submit}
        />
        <p className="nc-foot" data-hub="noora-foot">
          {usingAi
            ? `Answers come from Claude, an AI, and can be wrong. Your questions and notes aren’t stored, only how many you ask.${status.data ? ` ${status.data.questionsLeft} left today.` : ''} Pictures stay in this browser.`
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
