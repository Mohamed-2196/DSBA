// Mini Noora's chat card: her face and name at the top, the conversation as rich text, and a slim composer with what
// her AI can see above it. MiniNoora.tsx places it (beside her, or a sheet on a phone). "Open full chat" carries the
// conversation over to the full page (/noora). This file is fetched on demand and brings the conversation, its saved
// copies and her scripted "brain" with it.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import type { NooraScript } from '../../api/types';
import { useAuth } from '../../auth';
import { useOpenNote } from '../notes/public';
import { useYear } from '../../state';
import { useModules } from '../../state/modules';
import { ConfirmDialog, IconButton, Menu, cx, Icon, glyph } from '../../ui';
import { carriesFiles, faceFor, highestId, moodFor, spokenFor } from './chat';
import { Composer, type NoteChoice, type PageChoice, type PaperChoice } from './Composer';
import { pageLabel } from './context';
import { Face } from './Face';
import { MessageList } from './Messages';
import { goToPage } from './open';
import { clearPaperAsk, usePaperAsk } from './paper';
import { RecentChats } from './RecentChats';
import type { ChatMood } from './poses';
import { pageSuggestions } from './suggestions';
import { lastQuestionAt } from './useChat';
import { useConversation } from './useConversation';
import { useDraft } from './useDraft';
import { pauseOf, pausedLine, questionsLeftLine, useNooraAi, type AskContext } from './useNooraAi';
import './ChatPanel.css';

const WAVE = 2400; // ms she waves when the chat opens
const NOTE_MAX = 20_000; // characters of a note her AI reads (the API's limit)

export interface ChatPanelProps {
  /** what she says in her own words, and the questions she offers */
  script: NooraScript;
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

export default function ChatPanel({
  script,
  open,
  sheet,
  calm,
  panelRef,
  onClose,
  onFollow,
  onHide,
  onMood,
}: ChatPanelProps) {
  const { year } = useYear();
  const { pathname, search } = useLocation();
  const { modules } = useModules();
  const { featureOn } = useAuth();

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
  // What goes with a question: read when it is sent.
  const context = (): AskContext => {
    const lesson = pageShared ? matchPath('/modules/:moduleId/lessons/:lessonId', pathname)?.params : undefined;
    const moduleId = pageShared
      ? (lesson?.moduleId ?? matchPath('/modules/:moduleId', pathname)?.params.moduleId ?? null)
      : null;
    return {
      route: pageShared ? `${pathname}${search}`.slice(0, 300) : '',
      year,
      moduleId,
      lessonId: lesson?.lessonId ?? null,
      note: withNote && openNote ? { title: openNote.title, body: openNote.body.slice(0, NOTE_MAX) } : null,
      paper: paper ? { itemId: paper.itemId, page: paper.page, question: paper.question } : null,
    };
  };
  const { on: aiOn, status, ai } = useNooraAi(context);

  const chat = useConversation({ year, calm, ai, script });
  const {
    greeting,
    messages,
    pending,
    busy,
    paused,
    send,
    stop,
    regenerate,
    chatId,
    chats,
    switchTo,
    remove,
    removeAll,
  } = chat;
  const draft = useDraft(send);

  const usingAi = ai !== null && !paused;
  const why = pauseOf(aiOn, paused, status.data);
  // "Include my note": offered while a note with words in it is open; ticked for one question at a time.
  const noteChoice: NoteChoice | null =
    usingAi && openNote && openNote.body.trim()
      ? {
          title: openNote.title.trim() || 'Untitled note',
          checked: withNote,
          long: openNote.body.length > NOTE_MAX,
          onChange: setWithNote,
        }
      : null;
  const pageChoice: PageChoice | null = usingAi
    ? { label: pageLabel(pathname, modules), shared: pageShared, onChange: setPageShared }
    : null;
  // A paper's question from the file viewer: it goes with every question until the student takes it off. Asking
  // about one fills the box once.
  const paperChoice: PaperChoice | null = usingAi && paper ? { ...paper, onRemove: clearPaperAsk } : null;
  const [filledFor, setFilledFor] = useState(0);
  if (asked !== filledFor) {
    setFilledFor(asked);
    if (paper) draft.setText(`Help me with question ${paper.question}.`);
  }
  const [dropping, setDropping] = useState(false);
  const [waving, setWaving] = useState(false);
  const [newFrom, setNewFrom] = useState(() => highestId(messages));
  const [confirming, setConfirming] = useState<'clear' | 'all' | null>(null);
  const [view, setView] = useState<'chat' | 'recent'>('chat');
  const input = useRef<HTMLTextAreaElement>(null);

  // Questions for the page the student is on.
  const pageChips = useMemo(
    () => pageSuggestions({ pathname, year, modules, isOn: featureOn, pages: script.pageChips }),
    [pathname, year, modules, featureOn, script.pageChips],
  );

  // Opening: she waves, and the keyboard goes to the text box. On a sheet it goes to the panel instead, so the
  // on-screen keyboard only comes up when the student taps the box.
  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() =>
      (sheet ? panelRef.current : input.current)?.focus({ preventScroll: true }),
    );
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
  if (!open && newFrom !== lastId) setNewFrom(lastId);

  const mood = moodFor(pending, waving);
  useEffect(() => {
    onMood(open ? mood : null);
  }, [open, mood, onMood]);

  const focusInput = () => requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  const submit = () => {
    if (draft.submit()) setWithNote(false); // the note goes with one question only
  };
  const suggest = useCallback((text: string) => void send({ text }), [send]);
  const editLast = () => {
    const question = messages[lastQuestionAt(messages)];
    if (!question) return;
    draft.edit(question);
    requestAnimationFrame(() => {
      const box = input.current;
      box?.setSelectionRange(box.value.length, box.value.length);
    });
  };
  /** Shows a saved conversation, or a new one. The one left stays saved. */
  const leave = (next: Parameters<typeof switchTo>[0]) => {
    switchTo(next);
    if (next) setNewFrom(highestId(next.messages));
    draft.reset();
    setView('chat');
    focusInput();
  };
  const deleteThis = () => {
    remove(chatId);
    clearPaperAsk();
    setConfirming(null);
    draft.reset();
    focusInput();
  };
  const deleteAll = () => {
    removeAll();
    setConfirming(null);
    setView('chat');
    focusInput();
  };
  /** The full page, with this conversation: it is saved first (an answer on its way stops). */
  const openPage = () => {
    if (busy) stop();
    onClose();
    goToPage({ chat: chatId });
  };

  const left = questionsLeftLine(status.data);
  const subline = busy
    ? 'Answering…'
    : why && messages.length
      ? 'Script answers only' // before then, her hello says so
      : usingAi
        ? (left ?? 'Knows your modules and this page')
        : 'Knows your modules';
  const footNote = usingAi
    ? `Answers by Claude, an AI: they can be wrong.${left ? ` ${left}.` : ''} Chats stay in this browser.`
    : 'She answers from the Hub’s modules and calendar. What you send her stays in this browser.';

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
        if (view === 'chat') draft.attach(e.dataTransfer.files);
      }}
    >
      <header className="nc-head">
        <Face bust={faceFor(pending, waving)} size={40} live className="nc-head__face" />
        <div className="nc-head__text">
          <h2 className="nc-head__title">Mini Noora</h2>
          <p className="nc-head__sub" data-hub="noora-sub">
            {usingAi && !busy ? <span className="nc-head__dot" aria-hidden="true" /> : null}
            {subline}
          </p>
        </div>
        <IconButton
          label="Open full chat"
          icon={<Icon glyph={glyph.expand} />}
          size="sm"
          tooltip
          onClick={openPage}
          data-hub="noora-open-page"
        />
        <IconButton
          label="New chat"
          icon={<Icon glyph={glyph.edit} />}
          size="sm"
          tooltip
          disabled={!messages.length && !pending}
          onClick={() => leave(null)}
          data-hub="noora-new"
        />
        <Menu
          align="end"
          className="nc-menu"
          label="Chat options"
          trigger={
            <IconButton label="Chat options" icon={<Icon glyph={glyph.more} />} size="sm" data-hub="noora-more" />
          }
          items={[
            {
              id: 'recent',
              label: 'Recent chats',
              icon: <Icon glyph={glyph.clock} />,
              onSelect: () => setView('recent'),
            },
            {
              id: 'clear',
              label: 'Clear chat',
              icon: <Icon glyph={glyph.trash} />,
              disabled: !messages.length && !pending,
              onSelect: () => setConfirming('clear'),
            },
            { id: 'hide', label: 'Hide Mini Noora', icon: <Icon glyph={glyph.eyeOff} />, onSelect: onHide },
            { divider: true, id: 'about-divider' },
            { heading: <span className="nc-menu__note">{footNote}</span>, id: 'about' },
          ]}
        />
        <IconButton
          label="Close chat"
          icon={<Icon glyph={glyph.close} />}
          size="sm"
          onClick={onClose}
          data-hub="noora-close"
        />
      </header>

      {view === 'recent' ? (
        <RecentChats
          chats={chats}
          current={chatId}
          onOpen={(saved) => (saved.id === chatId ? setView('chat') : leave(saved))}
          onBack={() => (setView('chat'), focusInput())}
          onDeleteAll={() => setConfirming('all')}
          onOpenPage={openPage}
        />
      ) : (
        <div className="nc-body">
          <MessageList
            greeting={greeting}
            messages={messages}
            pending={pending}
            conversation={chatId}
            open={open}
            calm={calm}
            pageChips={pageChips}
            paused={why ? pausedLine(why, status.data) : null}
            newFrom={newFrom}
            onSuggest={suggest}
            onRegenerate={regenerate}
            onFollow={onFollow}
          />
          <Composer
            inputRef={input}
            draft={draft.text}
            onDraft={draft.setText}
            files={draft.files}
            note={draft.fileNote}
            pageChoice={pageChoice}
            noteChoice={noteChoice}
            paperChoice={paperChoice}
            busy={busy}
            editing={draft.editing !== null}
            onAttach={draft.attach}
            onRemove={draft.removeFile}
            onSend={submit}
            onStop={stop}
            onEditLast={editLast}
            onCancelEdit={draft.cancelEdit}
          />
          <p className="nc-foot" data-hub="noora-foot">
            {footNote}
          </p>
          {/* Always there, shown while files are dragged over the chat. */}
          <div className="nc-drop" data-hub="noora-dropzone" aria-hidden="true">
            <Icon glyph={glyph.download} />
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
