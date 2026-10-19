// /noora: Noora's full page, a study assistant that answers anything a student studies. The chats saved in this
// browser down the left (a drawer on phones, collapsible on tablets and laptops), the conversation in a centred
// column, and a large composer at the bottom with attachments and added context (a module, a lesson, a past paper's
// question, a note). Before anything is asked she greets the student and offers a card per kind of help.
// The same conversation as the chat card: "Open full chat" there carries it over, and the card carries on with it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpenText,
  DotsThree,
  Exam,
  Keyboard,
  NotePencil,
  PencilSimple,
  SidebarSimple,
  SquaresFour,
  Trash,
  TrayArrowDown,
} from '@phosphor-icons/react';
import { useAuth } from '../../../auth';
import { useDocumentTitle, useLocalStorage, useMediaQuery, useYear } from '../../../state';
import { useModules } from '../../../state/modules';
import type { NooraScript } from '../../../api/types';
import {
  Button,
  ConfirmDialog,
  Drawer,
  IconButton,
  Kbd,
  Menu,
  Modal,
  QueryError,
  TextField,
  Tooltip,
  cx,
  modKeyLabel,
} from '../../../ui';
import { useNote } from '../../notes/public';
import { carriesFiles, faceFor, highestId, spokenFor } from '../chat';
import { Composer, Seen } from '../Composer';
import { Face } from '../Face';
import { MessageList } from '../Messages';
import { NOORA_PATH, pageOpening } from '../open';
import { pageSuggestions } from '../suggestions';
import { messageAsText } from '../refs';
import { copyText, appUrl } from '../../../lib/share';
import type { SavedChat } from '../saved';
import { lastQuestionAt } from '../useChat';
import { useConversation } from '../useConversation';
import { useDraft } from '../useDraft';
import { useNooraScript } from '../script';
import { pauseOf, pausedLine, questionsLeftLine, useNooraAi, type AskContext } from '../useNooraAi';
import { AddContext } from './AddContext';
import { NOTHING_ADDED, type Added } from './added';
import { ChatsSidebar } from './ChatsSidebar';
import { fill, starters, type Starter } from './starters';
import { Welcome } from './Welcome';
import '../ChatCard.css';
import '../ChatPanel.css';
import './NooraPage.css';

const NOTE_MAX = 20_000; // characters of a note her AI reads (the API's limit)
const SIDEBAR_KEY = 'hub.noora.sidebar'; // laptops: whether the chats list is shown (a device setting)
/** Phones, and any screen too short for the page's frame (a phone on its side): the page takes the whole window. */
const FULL = '(max-width: 699px), (max-height: 480px)';
const WIDE = '(min-width: 1100px)';

/** The page's keyboard shortcuts, as the dialog lists them. */
const SHORTCUTS = (mod: string): [string, string[]][] => [
  ['Send', ['Enter']],
  ['New line', ['Shift', 'Enter']],
  ['Edit your last question (in an empty box)', ['↑']],
  ['Stop the answer', ['Esc']],
  ['New chat', [mod, 'Shift', 'O']],
  ['Show or hide chats', [mod, 'Shift', 'S']],
  ['Copy her last answer', [mod, 'Shift', 'C']],
  ['Go to the box', [mod, '/']],
  ['Search the Hub', [mod, 'K']],
];

const firstNameOf = (name: string | null | undefined): string | null => name?.trim().split(/\s+/)[0] || null;

/** Whether the browser can go back within the Hub (React Router keeps the index in history.state). */
function canGoBack(): boolean {
  const state: unknown = window.history.state;
  return (
    typeof state === 'object' && state !== null && 'idx' in state && typeof state.idx === 'number' && state.idx > 0
  );
}

export default function NooraPage() {
  const script = useNooraScript();
  if (script.data) return <NooraScreen script={script.data} />;
  return (
    <div className="np np--loading" aria-busy={!script.isError || undefined}>
      {script.isError ? (
        <QueryError
          error={script.error}
          title="Noora didn’t load"
          onRetry={() => void script.refetch()}
          retrying={script.isFetching}
        />
      ) : (
        <div className="ncard-note" role="status">
          <Face bust="thinking" size={48} />
          <p>Opening Noora…</p>
        </div>
      )}
    </div>
  );
}

function NooraScreen({ script }: { script: NooraScript }) {
  const { year } = useYear();
  const { modules } = useModules();
  const { me, status: auth, requireAuth, featureOn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const full = useMediaQuery(FULL);
  const wide = useMediaQuery(WIDE);

  // ── What goes with each question ────────────────────────────────────────────────────────────────
  const [added, setAdded] = useState<Added>(NOTHING_ADDED);
  const note = useNote(added.note?.noteId ?? null);
  const context = (): AskContext => {
    const { subject, paper } = added;
    return {
      route: NOORA_PATH,
      year,
      moduleId: subject?.moduleId ?? null,
      lessonId: subject?.kind === 'lesson' ? subject.lessonId : null,
      note: added.note && note.data ? { title: note.data.title, body: note.data.text.slice(0, NOTE_MAX) } : null,
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
    rename,
    removeAll,
  } = chat;
  const draft = useDraft(send);
  const usingAi = ai !== null && !paused;
  const why = pauseOf(aiOn, paused, status.data);
  const guest = auth === 'guest';
  const current = chats.find((c) => c.id === chatId) ?? null;
  useDocumentTitle(current ? `${current.title} – Noora` : 'Noora');

  const input = useRef<HTMLTextAreaElement>(null);
  const focusInput = useCallback((select?: [number, number]) => {
    requestAnimationFrame(() => {
      const box = input.current;
      if (!box) return;
      box.focus({ preventScroll: true });
      if (select) box.setSelectionRange(...select);
    });
  }, []);

  // ── The chats list ──────────────────────────────────────────────────────────────────────────────
  const [sideWanted, setSideWanted] = useLocalStorage<boolean>(SIDEBAR_KEY, true);
  const [overlay, setOverlay] = useState(false); // tablets: the list over the conversation; phones: the drawer
  const docked = wide && !full;
  const sideShown = docked ? sideWanted !== false : overlay;
  const toggleSide = useCallback(
    () => (docked ? setSideWanted(sideWanted === false) : setOverlay((o) => !o)),
    [docked, sideWanted, setSideWanted],
  );
  const [newFrom, setNewFrom] = useState(() => highestId(messages));

  const openChat = (next: SavedChat | null) => {
    switchTo(next);
    if (next) setNewFrom(highestId(next.messages));
    draft.reset();
    setAdded(NOTHING_ADDED);
    setOverlay(false);
    focusInput();
  };
  const newChat = () => openChat(null);

  const [confirming, setConfirming] = useState<{ kind: 'one'; chat: SavedChat } | { kind: 'all' } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // ── Opened with a question, or with the card's conversation ─────────────────────────────────────
  const [toAsk, setToAsk] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (handled.current === location.key) return;
    handled.current = location.key;
    const opening = pageOpening(location.state);
    if (!opening.ask && !opening.chat) return;
    if (opening.chat && opening.chat !== chatId) {
      const saved = chats.find((c) => c.id === opening.chat);
      if (saved) openChat(saved);
    }
    if (opening.ask) {
      if (messages.length) openChat(null);
      setToAsk(opening.ask);
    }
    // Asked once: not again after a reload or Back.
    navigate(NOORA_PATH, { replace: true, state: null });
    // Only when the location changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  const statusSettled = !aiOn || !status.isPending;
  useEffect(() => {
    if (!toAsk || busy || messages.length || !statusSettled) return;
    setToAsk(null);
    send({ text: toAsk });
  }, [toAsk, busy, messages.length, statusSettled, send]);

  // ── Sending ─────────────────────────────────────────────────────────────────────────────────────
  const submit = () => {
    draft.submit();
  };
  const suggest = useCallback((text: string) => void send({ text }), [send]);
  const start = (s: Starter) => {
    const go = () => {
      const { text, select } = fill(s.template);
      draft.setText(text);
      focusInput(select);
    };
    if (guest && !requireAuth('Sign in to ask Noora anything', go)) return;
    go();
  };
  const editQuestion = useCallback(
    (m: Parameters<typeof draft.edit>[0]) => {
      draft.edit(m);
      requestAnimationFrame(() => {
        const box = input.current;
        if (!box) return;
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      });
    },
    [draft],
  );
  const editLast = () => {
    const question = messages[lastQuestionAt(messages)];
    if (question) editQuestion(question);
  };
  const copyLast = () => {
    const last = [...messages].reverse().find((m) => m.from === 'noora' && m.text);
    if (last && last.from === 'noora') void copyText(messageAsText(last, appUrl));
  };

  // ── Keyboard ────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && e.shiftKey && key === 'o') {
        e.preventDefault();
        newChat();
      } else if (mod && e.shiftKey && key === 's') {
        e.preventDefault();
        toggleSide();
      } else if (mod && e.shiftKey && key === 'c') {
        e.preventDefault();
        copyLast();
      } else if (e.key === 'Escape' && busy && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Files dropped anywhere on the page ──────────────────────────────────────────────────────────
  const [dropping, setDropping] = useState(false);

  // ── What the header and the welcome say ─────────────────────────────────────────────────────────
  const left = questionsLeftLine(status.data);
  const pausedText = why ? pausedLine(why, status.data) : null;
  const cards = useMemo(() => starters(script.starters, modules, year), [script.starters, modules, year]);
  // From her script she answers where things are, what a module holds and when exams are: those questions, not the
  // cards, which need her AI.
  const scriptQuestions = useMemo(
    () =>
      usingAi
        ? null
        : pageSuggestions({ pathname: NOORA_PATH, year, modules, isOn: featureOn, pages: script.pageChips }),
    [usingAi, year, modules, featureOn, script.pageChips],
  );
  const shortcut = modKeyLabel() === '⌘' ? '⌘' : 'Ctrl';

  const model = guest ? (
    <span className="np-model is-off" data-hub="noora-model">
      Script answers · sign in for AI
    </span>
  ) : why || !aiOn ? (
    <Tooltip label={pausedText ?? 'Her AI answers are off in the Hub right now.'} side="bottom">
      <span className="np-model is-off" tabIndex={0} data-hub="noora-model">
        Script answers
      </span>
    </Tooltip>
  ) : (
    <span className="np-model" data-hub="noora-model">
      <span className="np-model__name">Claude AI</span>
      {left ? <span className="np-model__left">{left}</span> : null}
    </span>
  );

  const contextChips = (
    <>
      {added.subject ? (
        <Seen
          icon={added.subject.kind === 'lesson' ? BookOpenText : SquaresFour}
          label={added.subject.label}
          title="Noora reads it with each question."
          removeLabel={`Take off ${added.subject.label}`}
          onRemove={() => setAdded((a) => ({ ...a, subject: null }))}
          hub="noora-context-subject"
        />
      ) : null}
      {added.paper ? (
        <Seen
          icon={Exam}
          label={added.paper.label}
          title="That page and the examiners’ report go to Claude with your questions."
          removeLabel="Take off the paper"
          onRemove={() => setAdded((a) => ({ ...a, paper: null }))}
          hub="noora-context-paper"
        />
      ) : null}
      {added.note ? (
        <Seen
          icon={NotePencil}
          label={
            note.isError
              ? `${added.note.label} (didn’t load)`
              : note.isPending
                ? `${added.note.label} (loading…)`
                : added.note.label
          }
          title="Its words go to Claude with your questions."
          removeLabel="Take off the note"
          onRemove={() => setAdded((a) => ({ ...a, note: null }))}
          hub="noora-context-note"
        />
      ) : null}
    </>
  );
  const anyAdded = Boolean(added.subject || added.paper || added.note);

  const sidebar = (
    <ChatsSidebar
      chats={chats}
      current={chatId}
      onOpen={(c) => (c.id === chatId ? setOverlay(false) : openChat(c))}
      onNew={newChat}
      onRename={rename}
      onDelete={(c) => setConfirming({ kind: 'one', chat: c })}
      onDeleteAll={() => setConfirming({ kind: 'all' })}
      onHide={full ? null : toggleSide}
    />
  );

  return (
    <div
      className={cx(
        'np',
        full && 'np--full',
        docked && 'np--docked',
        sideShown && 'is-side',
        dropping && 'is-dropping',
      )}
      data-hub="noora-page"
      onDragEnter={(e) => {
        if (carriesFiles(e)) setDropping(true);
      }}
      onDragOver={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
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
        draft.attach(e.dataTransfer.files);
      }}
    >
      {full ? (
        <Drawer
          open={overlay}
          onClose={() => setOverlay(false)}
          title="Chats"
          side="left"
          width="min(88vw, 340px)"
          className="np-drawer"
          bodyClassName="np-drawer__body"
        >
          {sidebar}
        </Drawer>
      ) : sideShown ? (
        <>
          <aside className="np-side" aria-label="Chats">
            {sidebar}
          </aside>
          {docked ? null : (
            <button
              type="button"
              className="np-scrim"
              aria-label="Hide chats"
              tabIndex={-1}
              onClick={() => setOverlay(false)}
            />
          )}
        </>
      ) : null}

      <section className="np-main" aria-labelledby="np-title">
        <header className="np-bar">
          {full ? (
            <IconButton
              label="Back to the Hub"
              icon={ArrowLeft}
              size="sm"
              onClick={() => (canGoBack() ? navigate(-1) : navigate('/'))}
              data-hub="noora-back"
            />
          ) : null}
          {full || !sideShown ? (
            <IconButton
              label="Show chats"
              icon={SidebarSimple}
              size="sm"
              tooltip={!full}
              onClick={toggleSide}
              data-hub="noora-sidebar-show"
            />
          ) : null}
          <Face bust={faceFor(pending, false)} size={32} live className="np-bar__face" />
          <div className="np-bar__text">
            <h1 id="np-title" className="np-bar__title">
              Noora
            </h1>
            <p className="np-bar__chat" dir="auto">
              {busy ? 'Answering…' : current ? current.title : 'New chat'}
            </p>
          </div>
          <div className="np-bar__end">
            {/* One signal at a time: while the welcome says she answers from her script, the header doesn't. */}
            {usingAi || messages.length || pending ? model : null}
            <IconButton
              label="New chat"
              icon={NotePencil}
              size="sm"
              tooltip
              disabled={!messages.length && !pending}
              onClick={newChat}
              data-hub="noora-page-new-top"
            />
            <Menu
              align="end"
              label="Chat options"
              trigger={<IconButton label="Chat options" icon={DotsThree} size="sm" data-hub="noora-page-more" />}
              items={[
                {
                  id: 'rename',
                  label: 'Rename chat',
                  icon: PencilSimple,
                  disabled: !current,
                  onSelect: () => setRenaming(true),
                },
                {
                  id: 'delete',
                  label: 'Delete chat',
                  icon: Trash,
                  danger: true,
                  disabled: !current,
                  onSelect: () => current && setConfirming({ kind: 'one', chat: current }),
                },
                { divider: true, id: 'd' },
                { id: 'keys', label: 'Keyboard shortcuts', icon: Keyboard, onSelect: () => setShortcutsOpen(true) },
              ]}
            />
          </div>
        </header>

        <MessageList
          className="np-list"
          greeting={greeting}
          messages={messages}
          pending={pending}
          conversation={chatId}
          open
          calm={calm}
          pageChips={[]}
          empty={
            <Welcome
              name={firstNameOf(me?.displayName)}
              lead={script.welcome}
              starters={cards}
              onStart={start}
              questions={scriptQuestions}
              onAsk={suggest}
              paused={pausedText}
              onSignIn={guest ? () => requireAuth('Sign in to ask Noora anything') : null}
            />
          }
          newFrom={newFrom}
          onSuggest={suggest}
          onRegenerate={regenerate}
          onEdit={editQuestion}
          onFollow={() => undefined}
        />

        <div className="np-compose">
          <Composer
            size="page"
            inputRef={input}
            draft={draft.text}
            onDraft={draft.setText}
            files={draft.files}
            note={draft.fileNote}
            busy={busy}
            editing={draft.editing !== null}
            onAttach={draft.attach}
            onRemove={draft.removeFile}
            onSend={submit}
            onStop={stop}
            onEditLast={editLast}
            onCancelEdit={draft.cancelEdit}
            placeholder="Ask Noora anything…"
            label="Message Noora"
            context={anyAdded ? contextChips : null}
            tools={
              usingAi ? <AddContext added={added} onChange={setAdded} year={year} onDone={() => focusInput()} /> : null
            }
          />
          <p className="np-fine" data-hub="noora-fine">
            {usingAi
              ? 'Noora uses Claude, an AI, and can be wrong: check what matters against your lessons.'
              : 'Noora answers from the Hub’s modules and calendar.'}{' '}
            Chats stay in this browser.
          </p>
        </div>
        <div className="nc-drop np-drop" aria-hidden="true">
          <TrayArrowDown weight="duotone" />
          Drop to attach
        </div>
      </section>

      <p className="visually-hidden" aria-live="polite">
        {spokenFor(messages, pending, newFrom)}
      </p>

      {renaming && current ? (
        <RenameDialog
          title={current.title}
          onClose={() => setRenaming(false)}
          onSave={(title) => {
            rename(current.id, title);
            setRenaming(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirming?.kind === 'one'}
        title="Delete this chat?"
        body={
          confirming?.kind === 'one' ? `“${confirming.chat.title}” goes from this browser. You can’t get it back.` : ''
        }
        confirmLabel="Delete chat"
        tone="danger"
        onConfirm={() => {
          if (confirming?.kind === 'one') {
            remove(confirming.chat.id);
            if (confirming.chat.id === chatId) {
              draft.reset();
              setAdded(NOTHING_ADDED);
            }
          }
          setConfirming(null);
          focusInput();
        }}
        onClose={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'all'}
        title="Delete all chats?"
        body="Every chat saved in this browser goes, this one too. You can’t get them back."
        confirmLabel="Delete all chats"
        tone="danger"
        onConfirm={() => {
          removeAll();
          draft.reset();
          setAdded(NOTHING_ADDED);
          setConfirming(null);
          focusInput();
        }}
        onClose={() => setConfirming(null)}
      />
      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" size="sm">
        <dl className="np-keys">
          {SHORTCUTS(shortcut).map(([what, keys]) => (
            <div key={what} className="np-keys__row">
              <dt>{what}</dt>
              <dd>
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}

function RenameDialog({
  title,
  onClose,
  onSave,
}: {
  title: string;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  const [value, setValue] = useState(title);
  return (
    <Modal
      open
      onClose={onClose}
      title="Rename chat"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="np-rename" data-hub="noora-rename-save">
            Save
          </Button>
        </>
      }
    >
      <form
        id="np-rename"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(value);
        }}
      >
        <TextField
          label="Name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          hint="Leave it empty to name it after its first question."
          data-autofocus
        />
      </form>
    </Modal>
  );
}
