// The conversation as it is drawn: her answers as readable rich text, the student's questions as quiet lines on the
// right. No bubbles and no faces beside each message: her face is in the card's header. Each answer shows its time
// on hover or focus and can be copied; her last one can be asked again. Before anything is asked, she says hello
// with questions for the page. The list follows a streaming answer only while it is scrolled to the bottom; scrolled
// up, it stays put and offers "Jump to latest".
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowClockwise, ArrowDown, ArrowRight, Books, CalendarDots, Check, Copy, FileText, PlayCircle, SquaresFour, type Icon } from '@phosphor-icons/react';
import { appUrl, copyText } from '../../lib/share';
import { formatClock } from '../../lib/dates';
import { IconButton, cx, safeInternalPath } from '../../ui';
import { FileChip, Shot } from './Attachment';
import { Formula, Steps } from './Formula';
import { messageAsText, refKind, type RefKind } from './refs';
import { Rich } from './RichText';
import type { Message, MyMessage as MyMessageData, NooraMessage as NooraMessageData, Ref, Reply } from './types';
import type { Pending } from './useChat';

const KIND_ICON: Record<RefKind, Icon> = { lesson: PlayCircle, files: FileText, module: SquaresFour, calendar: CalendarDots, library: Books, page: ArrowRight };
const COPIED_FOR = 1600; // ms the copy button says it worked
const AFTER_MAX = 3; // suggestions offered after an answer
const NEAR_BOTTOM = 48; // px from the bottom that still counts as being at the newest message

/** "Where to look": a card per place in the Hub, which opens it. */
function Refs({ refs, onFollow }: { refs: readonly Ref[]; onFollow: () => void }) {
  return (
    <div className="nc-refs" data-hub="noora-refs">
      <p className="nc-label">Where to look</p>
      <ul role="list" className="nc-cards">
        {refs.map((ref, i) => {
          const to = safeInternalPath(ref.to);
          const KindIcon = KIND_ICON[refKind(ref.to)];
          const body = (
            <>
              <KindIcon className="nc-card__icon" aria-hidden="true" weight="duotone" />
              <span className="nc-card__text">
                <span className="nc-card__label">{ref.label}</span>
                <span className="nc-card__code">{ref.code}</span>
              </span>
              {to ? <ArrowRight className="nc-card__go" aria-hidden="true" /> : null}
            </>
          );
          return (
            <li key={`${ref.code} ${ref.to}`} style={{ '--i': i } as CSSProperties}>
              {to ? (
                <Link to={to} className="nc-card" onClick={onFollow}>
                  {body}
                </Link>
              ) : (
                <span className="nc-card">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Questions to ask with one press: a short list of plain text buttons. */
function Suggestions({ title, list, onPick, className }: { title: string; list: readonly string[]; onPick: (text: string) => void; className?: string }) {
  if (!list.length) return null;
  return (
    <div className={cx('nc-suggest', className)} role="group" aria-label={title}>
      <p className="nc-label" aria-hidden="true">
        {title}
      </p>
      <ul role="list" className="nc-suggest__list">
        {list.map((s) => (
          <li key={s}>
            <button type="button" className="nc-suggest__item" onClick={() => onPick(s)} data-hub="noora-suggestion">
              <span>{s}</span>
              <ArrowRight className="nc-suggest__go" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Time({ at }: { at: number }) {
  return (
    <time className="nc-time u-tabular" dateTime={new Date(at).toISOString()}>
      {formatClock(at)}
    </time>
  );
}

function CopyButton({ message }: { message: NooraMessageData }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const done = setTimeout(() => setCopied(false), COPIED_FOR);
    return () => clearTimeout(done);
  }, [copied]);
  return (
    <IconButton
      size="sm"
      className="nc-copy"
      label={copied ? 'Copied' : 'Copy answer'}
      icon={copied ? Check : Copy}
      tooltip
      tooltipSide="top"
      onClick={() => {
        void copyText(messageAsText(message, appUrl)).then(setCopied);
      }}
      data-hub="noora-copy"
    />
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="nc-turn nc-turn--noora nc-thinking is-new" data-hub="noora-thinking">
      <span className="nc-thinking__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{label}</span>
    </div>
  );
}

interface NooraMessageProps {
  message: NooraMessageData;
  /** while she is still typing, how many characters are on screen; after that null */
  shown: number | null;
  isNew: boolean;
  /** her last answer, settled: it can be asked again (null: it can't) */
  onRegenerate: (() => void) | null;
  onFollow: () => void;
}

// Both kinds of message are memoised: while a reply streams in, only the answer that is growing redraws.
const NooraMessage = memo(function NooraMessage({ message, shown, isNew, onRegenerate, onFollow }: NooraMessageProps) {
  const chars = useMemo(() => (message.ai ? [] : Array.from(message.text)), [message.ai, message.text]);
  const typing = shown != null;
  return (
    <article className={cx('nc-turn', 'nc-turn--noora', isNew && 'is-new')} aria-label="Mini Noora" data-hub="noora-message" data-from="noora">
      {message.notice ? (
        <div className="nc-notice" data-hub="noora-notice">
          <p>{message.notice}</p>
          {message.retry && onRegenerate ? (
            <button type="button" className="nc-notice__retry" onClick={onRegenerate} data-hub="noora-retry">
              <ArrowClockwise aria-hidden="true" weight="bold" />
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {message.ai ? (
        message.text ? <Rich text={message.text} caret={typing} onFollow={onFollow} /> : null
      ) : message.text ? (
        <p className="nc-prose">
          {typing ? chars.slice(0, shown).join('') : message.text}
          {typing ? <span className="nc-caret" aria-hidden="true" /> : null}
        </p>
      ) : null}
      {!typing && message.formula ? <Formula formula={message.formula} /> : null}
      {!typing && message.steps?.length ? <Steps steps={message.steps} /> : null}
      {!typing && message.refs.length ? <Refs refs={message.refs} onFollow={onFollow} /> : null}
      {typing ? null : (
        <div className={cx('nc-meta', onRegenerate && 'is-last')}>
          <Time at={message.at} />
          {message.text ? <CopyButton message={message} /> : null}
          {onRegenerate ? (
            <IconButton size="sm" className="nc-copy" label="Regenerate answer" icon={ArrowClockwise} tooltip tooltipSide="top" onClick={onRegenerate} data-hub="noora-regenerate" />
          ) : null}
        </div>
      )}
    </article>
  );
});

interface MyMessageProps {
  message: MyMessageData;
  isNew: boolean;
  /** a picture has loaded (the list keeps to the newest message) */
  onLoad: () => void;
}

const MyMessage = memo(function MyMessage({ message, isNew, onLoad }: MyMessageProps) {
  const pictures = message.attachments.filter((a) => a.kind === 'image');
  const files = message.attachments.filter((a) => a.kind !== 'image');
  return (
    <div className={cx('nc-turn', 'nc-turn--me', isNew && 'is-new')} role="group" aria-label="You" data-hub="noora-message" data-from="me">
      {pictures.map((file) => (
        <Shot key={file.id} file={file} onLoad={onLoad} />
      ))}
      {files.map((file) => (
        <FileChip key={file.id} file={file} />
      ))}
      {message.text ? (
        <p className="nc-asked" dir="auto">
          {message.text}
        </p>
      ) : null}
    </div>
  );
});

/** Before anything is asked: her hello, and questions about the page the student is on. */
function Hello({ greeting, chips, onSuggest }: { greeting: Reply; chips: readonly string[]; onSuggest: (text: string) => void }) {
  return (
    <div className="nc-hello" data-hub="noora-empty">
      <p className="nc-hello__text">{greeting.text}</p>
      <Suggestions title="For this page" list={chips} onPick={onSuggest} />
    </div>
  );
}

export interface MessageListProps {
  greeting: Reply;
  messages: Message[];
  pending: Pending | null;
  /** shown or not (the list goes back to the newest message when it is shown again) */
  open: boolean;
  /** reduced motion */
  calm: boolean;
  /** questions about the page the student is on */
  pageChips: readonly string[];
  /** messages with an id above this one arrive with a small entrance */
  newFrom: number;
  /** a suggestion was chosen */
  onSuggest: (text: string) => void;
  /** ask the last question again */
  onRegenerate: () => void;
  /** a "Where to look" link was followed */
  onFollow: () => void;
}

/** The scrolling list. It keeps to the newest message while the student is there. */
export const MessageList = memo(function MessageList({ greeting, messages, pending, open, calm, pageChips, newFrom, onSuggest, onRegenerate, onFollow }: MessageListProps) {
  const list = useRef<HTMLDivElement>(null);
  const stuck = useRef(true); // at the newest message: a growing answer is followed
  const [away, setAway] = useState(false);
  const toNewest = useCallback(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, []);
  const onScroll = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM;
    stuck.current = near;
    setAway(!near);
  }, []);
  const onPicture = useCallback(() => {
    if (stuck.current) toNewest();
  }, [toNewest]);
  const jump = () => {
    stuck.current = true;
    setAway(false);
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: calm ? 'auto' : 'smooth' });
  };

  // A question the student has just asked is always shown, with the answer that follows it.
  const lastMine = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].from === 'me') return messages[i].id;
    return 0;
  }, [messages]);
  useLayoutEffect(() => {
    stuck.current = true;
  }, [lastMine]);
  // The empty chat starts at its top (her hello); a conversation keeps to its newest message while the student is
  // there, and stays where it is when they have scrolled up to read.
  useLayoutEffect(() => {
    if (!open || (!messages.length && !pending)) return;
    if (stuck.current) toNewest();
    else onScroll();
  }, [messages, pending, open, toNewest, onScroll]);

  const typing = pending && pending.phase === 'typing' ? pending : null;
  const resting = !pending || pending.phase === 'done';
  const last = messages[messages.length - 1];
  // After her last answer: the questions it suggests, or else the page's own.
  const own = last?.from === 'noora' && last.suggestions?.length ? last.suggestions : null;
  // Never offer what has just been asked.
  const after = useMemo(() => {
    const asked = new Set(messages.flatMap((m) => (m.from === 'me' ? [m.text.trim().toLowerCase()] : [])));
    return (own ?? pageChips).filter((s) => !asked.has(s.toLowerCase())).slice(0, AFTER_MAX);
  }, [messages, own, pageChips]);
  const canRegenerate = resting && last?.from === 'noora' && messages.some((m) => m.from === 'me');

  return (
    <div className="nc-scroll">
      <div ref={list} className="nc-messages" onScroll={onScroll} data-hub="noora-messages">
        {messages.length === 0 && !pending ? <Hello greeting={greeting} chips={pageChips} onSuggest={onSuggest} /> : null}
        {messages.map((m) =>
          m.from === 'me' ? (
            <MyMessage key={m.id} message={m} isNew={m.id > newFrom} onLoad={onPicture} />
          ) : (
            <NooraMessage
              key={m.id}
              message={m}
              shown={typing && typing.reply.id === m.id ? typing.shown : null}
              isNew={m.id > newFrom}
              onRegenerate={canRegenerate && m === last ? onRegenerate : null}
              onFollow={onFollow}
            />
          ),
        )}
        {pending && pending.phase === 'thinking' ? <Thinking label={pending.label} /> : null}
        {resting && last?.from === 'noora' ? <Suggestions className="nc-suggest--after" title={own ? 'Try asking' : 'For this page'} list={after} onPick={onSuggest} /> : null}
      </div>
      {away && messages.length ? (
        <button type="button" className="nc-jump" onClick={jump} data-hub="noora-jump">
          <ArrowDown aria-hidden="true" weight="bold" />
          Jump to latest
        </button>
      ) : null}
    </div>
  );
});
