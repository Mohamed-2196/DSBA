// Mini Noora's chat: a calm card with her name and face at the top, the conversation as rich text, and a slim
// composer with what her AI can see above it. MiniNoora.tsx places it (beside her, or a sheet on a phone). This file
// is fetched on demand and brings the conversation, its saved copies (saved.ts) and her scripted "brain" with it.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { matchPath, useLocation } from 'react-router-dom';
import { ArrowCounterClockwise, ClockCounterClockwise, DotsThree, EyeSlash, NotePencil, TrayArrowDown, X } from '@phosphor-icons/react';
import type { NooraStatus } from '../../api/types';
import { useAuth } from '../../auth';
import { useOpenNote } from '../notes/public';
import { removeStored, useLocalStorage, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { ConfirmDialog, IconButton, Menu, cx } from '../../ui';
import { NOORA_STATUS_KEY, useNooraStatus } from './ai';
import { Composer, type NoteChoice, type PageChoice, type PaperChoice } from './Composer';
import { pageLabel } from './context';
import { Face } from './Face';
import { addFiles, release, releaseAll, type Attachment } from './files';
import { MessageList } from './Messages';
import { clearPaperAsk, usePaperAsk } from './paper';
import { RecentChats } from './RecentChats';
import { plainText } from './rich';
import { RECENT_KEY, newChatId, parseRecent, readCurrent, withChat, writeCurrent, type SavedChat } from './saved';
import type { Bust } from './sprites';
import type { ChatMood } from './poses';
import { pageSuggestions } from './suggestions';
import type { Message } from './types';
import { lastQuestionAt, useChat, type ChatAi, type Pause, type Pending } from './useChat';
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

/**
 * What a screen reader hears: that she is thinking, that she is answering (once, not word by word), then the whole
 * reply at once. Nothing for a conversation that was already there (`heardUpTo`).
 */
function spokenFor(messages: Message[], pending: Pending | null, heardUpTo: number): string {
  if (pending && pending.phase === 'thinking') return 'Mini Noora is thinking.';
  if (pending && pending.phase === 'typing') return 'Mini Noora is answering.';
  const last = messages[messages.length - 1];
  if (!last || last.from !== 'noora' || last.id <= heardUpTo) return '';
  const notice = last.notice ? `${last.notice} ` : '';
  const where = last.refs.length ? ` Where to look: ${last.refs.map((r) => `${r.code}, ${r.label}`).join('; ')}.` : '';
  const working = (last.steps ?? []).map((s) => s.say).join(' ');
  return `${notice}${plainText(last.text)}${last.formula ? ` ${last.formula.say}` : ''}${working ? ` ${working}` : ''}${where}`;
}

const SCRIPT_CAN = 'I answer from my script: modules, lessons, exam dates and where things are in the Hub.';

/** Why her AI isn't answering, said plainly, with what she can still do. */
function pausedLine(why: Pause, status: NooraStatus | undefined): string {
  if (why === 'limit') return `You’ve used today’s ${status ? `${status.dailyQuestions} ` : ''}AI questions. Until tomorrow, ${SCRIPT_CAN}`;
  if (why === 'budget') return `My AI answers are paused until next month. Until then, ${SCRIPT_CAN}`;
  return `My AI answers aren’t available right now. ${SCRIPT_CAN}`;
}

const highestId = (messages: readonly Message[]): number => messages.reduce((top, m) => Math.max(top, m.id), 0);

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
  const outOfQuestions = status.data !== undefined && status.data.questionsLeft <= 0;
  const aiReady = aiOn && status.data?.available !== false && !outOfQuestions;
  const openNote = useOpenNote();
  const [withNote, setWithNote] = useState(false);
  const { paper, asked } = usePaperAsk();
  // "Share this page": on for each new page, until the student takes it off.
  const [pageShared, setPageShared] = useState(true);
  const [sharedFor, setSharedFor] = useState(pathname);
  if (sharedFor !== pathname) {
    setSharedFor(pathname);
    setPageShared(true);
  }
  const qc = useQueryClient();
  const screen = useRef({ pathname, search, year, openNote, withNote, paper, pageShared });
  useEffect(() => {
    screen.current = { pathname, search, year, openNote, withNote, paper, pageShared };
  });
  const ai = useMemo<ChatAi | null>(
    () =>
      aiReady
        ? {
            modules,
            question: (text, history) => {
              const now = screen.current;
              const lesson = now.pageShared ? matchPath('/modules/:moduleId/lessons/:lessonId', now.pathname)?.params : undefined;
              const moduleId = now.pageShared ? (lesson?.moduleId ?? matchPath('/modules/:moduleId', now.pathname)?.params.moduleId ?? null) : null;
              const note = now.withNote && now.openNote ? { title: now.openNote.title, body: now.openNote.body.slice(0, NOTE_MAX) } : null;
              return {
                question: text,
                route: now.pageShared ? `${now.pathname}${now.search}`.slice(0, 300) : '',
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

  // The conversation: the tab's own, carried on after a reload; the last few are saved in this browser.
  const [first] = useState(readCurrent);
  const [chatId, setChatId] = useState(() => first?.id ?? newChatId());
  const [stored, setStored] = useLocalStorage<unknown>(RECENT_KEY, []);
  const recent = useMemo(() => parseRecent(stored), [stored]);
  const { greeting, messages, pending, busy, paused, send, stop, regenerate, clear, load } = useChat({ year, calm, ai, initial: first?.messages });
  useEffect(() => {
    if (busy) return; // only settled conversations are saved
    writeCurrent(chatId, messages);
    if (messages.length) setStored((list: unknown) => withChat(parseRecent(list), chatId, messages));
  }, [busy, chatId, messages, setStored]);

  const usingAi = ai !== null && !paused;
  const why: Pause | null = aiOn ? (paused ?? (status.data?.available === false ? 'off' : outOfQuestions ? 'limit' : null)) : null;
  // "Include my note": offered while a note with words in it is open; ticked for one question at a time.
  const noteChoice: NoteChoice | null =
    usingAi && openNote && openNote.body.trim()
      ? { title: openNote.title.trim() || 'Untitled note', checked: withNote, long: openNote.body.length > NOTE_MAX, onChange: setWithNote }
      : null;
  const pageChoice: PageChoice | null = usingAi ? { label: pageLabel(pathname, modules), shared: pageShared, onChange: setPageShared } : null;
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
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
  const [newFrom, setNewFrom] = useState(() => highestId(first?.messages ?? []));
  const [confirming, setConfirming] = useState<'clear' | 'all' | null>(null);
  const [view, setView] = useState<'chat' | 'recent'>('chat');
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

  const focusInput = () => requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
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
    if (!send({ text, attachments: files, edit: editing })) return; // she is still answering
    setWithNote(false); // the note goes with one question only
    setDraft('');
    setEditing(false);
    setFiles([]); // the pictures now belong to the message
    setNote(null);
  };
  const suggest = useCallback((text: string) => void send({ text }), [send]);
  const editLast = () => {
    const question = messages[lastQuestionAt(messages)];
    if (!question || question.from !== 'me' || !question.text) return;
    setDraft(question.text);
    setEditing(true);
    requestAnimationFrame(() => {
      const box = input.current;
      box?.setSelectionRange(box.value.length, box.value.length);
    });
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };
  /** Leaves the conversation on screen for another (`next`), or for a new one. The one left stays saved. */
  const leave = (next: SavedChat | null) => {
    if (busy) stop();
    if (messages.length) setStored((list: unknown) => withChat(parseRecent(list), chatId, messages));
    if (next) {
      load(next.messages);
      setNewFrom(highestId(next.messages));
    } else {
      clear();
    }
    setChatId(next?.id ?? newChatId());
    setEditing(false);
    setDraft('');
    setView('chat');
    focusInput();
  };
  const deleteThis = () => {
    clear();
    clearPaperAsk();
    setStored((list: unknown) => parseRecent(list).filter((c) => c.id !== chatId));
    setChatId(newChatId());
    setConfirming(null);
    setEditing(false);
    focusInput();
  };
  const deleteAll = () => {
    clear();
    removeStored(RECENT_KEY);
    setChatId(newChatId());
    setConfirming(null);
    setView('chat');
    focusInput();
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
        if (view === 'chat') attach(e.dataTransfer.files);
      }}
    >
      <header className="nc-head">
        <Face bust={faceFor(pending, waving)} size={32} live className="nc-head__face" />
        <div className="nc-head__text">
          <h2 className="nc-head__title">Mini Noora</h2>
          <p className="nc-head__sub">{busy ? 'Answering…' : usingAi ? 'Knows your modules and this page' : 'Knows your modules'}</p>
        </div>
        <IconButton label="New chat" icon={NotePencil} size="sm" tooltip disabled={!messages.length && !pending} onClick={() => leave(null)} data-hub="noora-new" />
        <Menu
          align="end"
          className="nc-menu"
          label="Chat options"
          trigger={<IconButton label="Chat options" icon={DotsThree} size="sm" data-hub="noora-more" />}
          items={[
            { id: 'recent', label: 'Recent chats', icon: ClockCounterClockwise, onSelect: () => setView('recent') },
            { id: 'clear', label: 'Clear chat', icon: ArrowCounterClockwise, disabled: !messages.length && !pending, onSelect: () => setConfirming('clear') },
            { id: 'hide', label: 'Hide Mini Noora', icon: EyeSlash, onSelect: onHide },
          ]}
        />
        <IconButton label="Close chat" icon={X} size="sm" onClick={onClose} data-hub="noora-close" />
      </header>

      {view === 'recent' ? (
        <RecentChats chats={recent} current={chatId} onOpen={(chat) => (chat.id === chatId ? setView('chat') : leave(chat))} onBack={() => (setView('chat'), focusInput())} onDeleteAll={() => setConfirming('all')} />
      ) : (
        <div className="nc-body">
          {why ? (
            <p className="nc-banner" data-hub="noora-ai-paused">
              {pausedLine(why, status.data)}
            </p>
          ) : null}
          <MessageList
            greeting={greeting}
            messages={messages}
            pending={pending}
            open={open}
            calm={calm}
            pageChips={pageChips}
            newFrom={newFrom}
            onSuggest={suggest}
            onRegenerate={regenerate}
            onFollow={onFollow}
          />
          <Composer
            inputRef={input}
            draft={draft}
            onDraft={setDraft}
            files={files}
            note={note}
            pageChoice={pageChoice}
            noteChoice={noteChoice}
            paperChoice={paperChoice}
            busy={busy}
            editing={editing}
            onAttach={attach}
            onRemove={remove}
            onSend={submit}
            onStop={stop}
            onEditLast={editLast}
            onCancelEdit={cancelEdit}
          />
          <p className="nc-foot" data-hub="noora-foot">
            {usingAi
              ? `Claude, an AI, writes these answers and can be wrong.${status.data ? ` ${status.data.questionsLeft} of ${status.data.dailyQuestions} left today.` : ''} Chats and pictures stay in this browser; the Hub only counts questions.`
              : 'She answers from the Hub’s modules and calendar. What you send her stays in this browser.'}
          </p>
          {/* Always there, shown while files are dragged over the chat. */}
          <div className="nc-drop" data-hub="noora-dropzone" aria-hidden="true">
            <TrayArrowDown weight="duotone" />
            Drop to attach
          </div>
        </div>
      )}
      <p className="visually-hidden" aria-live="polite">
        {spokenFor(messages, pending, newFrom)}
      </p>

      <ConfirmDialog
        open={confirming === 'clear'}
        title="Clear the chat?"
        body="Your messages and her answers go, from this browser too. You can’t get them back."
        confirmLabel="Clear chat"
        tone="danger"
        onConfirm={deleteThis}
        onClose={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === 'all'}
        title="Delete all chats?"
        body="Every chat saved in this browser goes, this one too. You can’t get them back."
        confirmLabel="Delete all chats"
        tone="danger"
        onConfirm={deleteAll}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}
