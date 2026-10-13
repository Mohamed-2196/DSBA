// The conversation as it is drawn: her messages on the left with her face, the student's on the right. Messages in
// a row from the same side form a group (one face, closer together). Each shows its time on hover or focus, and
// her answers can be copied. Before anything is asked, she says hello with questions for the page.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Books, CalendarDots, Check, Copy, FileText, Lightbulb, PlayCircle, SquaresFour, type Icon } from '@phosphor-icons/react';
import { appUrl, copyText } from '../../lib/share';
import { formatClock } from '../../lib/dates';
import { IconButton, cx, safeInternalPath } from '../../ui';
import { FileChip, Shot } from './Attachment';
import { Face } from './Face';
import { Formula, Steps } from './Formula';
import { messageAsText, refKind, type RefKind } from './refs';
import { EMPTY_POSE, poseUrl } from './sprites';
import type { Message, MyMessage as MyMessageData, NooraMessage as NooraMessageData, Ref, Reply } from './types';
import type { Pending } from './useChat';

const KIND_ICON: Record<RefKind, Icon> = { lesson: PlayCircle, files: FileText, module: SquaresFour, calendar: CalendarDots, library: Books, page: ArrowRight };
const COPIED_FOR = 1600; // ms the copy button says it worked

/** "Where to look": a card per place in the Hub, which opens it. */
function Refs({ refs, onFollow }: { refs: readonly Ref[]; onFollow: () => void }) {
  return (
    <div className="nc-refs" data-hub="noora-refs">
      <p className="nc-refs__title">Where to look</p>
      <ul role="list" className="nc-cards">
        {refs.map((ref, i) => {
          const to = safeInternalPath(ref.to);
          const KindIcon = KIND_ICON[refKind(ref.to)];
          const body = (
            <>
              <span className="nc-card__icon" aria-hidden="true">
                <KindIcon weight="duotone" />
              </span>
              <span className="nc-card__text">
                <span className="nc-card__code">{ref.code}</span>
                <span className="nc-card__label">{ref.label}</span>
              </span>
              {to ? <ArrowRight className="nc-card__go" aria-hidden="true" weight="bold" /> : null}
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

/** Questions to ask with one tap. */
function Chips({ title, list, onPick, className }: { title: string; list: readonly string[]; onPick: (text: string) => void; className?: string }) {
  if (!list.length) return null;
  return (
    <div className={cx('nc-chips', className)} role="group" aria-label={title}>
      <p className="nc-chips__title" aria-hidden="true">
        <Lightbulb weight="duotone" />
        {title}
      </p>
      <div className="nc-chips__list">
        {list.map((s) => (
          <button key={s} type="button" className="nc-chip" onClick={() => onPick(s)} data-hub="noora-suggestion">
            {s}
          </button>
        ))}
      </div>
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
    <div className="nc-msg nc-msg--noora is-first is-new" data-hub="noora-thinking">
      <Face bust="thinking" size={32} className="nc-msg__face" />
      <div className="nc-bubble nc-thinking">
        <span className="nc-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}

interface NooraMessageProps {
  message: NooraMessageData;
  /** while she is still typing, how many characters are on screen; after that null */
  shown: number | null;
  isNew: boolean;
  /** the first of a run of her messages: it carries her face */
  first: boolean;
  onFollow: () => void;
}

// Both kinds of message are memoised: while a reply streams in, only the bubble that is growing redraws.
const NooraMessage = memo(function NooraMessage({ message, shown, isNew, first, onFollow }: NooraMessageProps) {
  const chars = useMemo(() => Array.from(message.text), [message.text]);
  const typing = shown != null;
  return (
    <div className={cx('nc-msg', 'nc-msg--noora', first && 'is-first', isNew && 'is-new')} role="group" aria-label="Mini Noora" data-hub="noora-message" data-from="noora">
      {first ? <Face size={32} className="nc-msg__face" /> : <span className="nc-msg__face" aria-hidden="true" />}
      <div className="nc-msg__body">
        <div className="nc-bubble">
          <p className="nc-bubble__text">
            {typing ? chars.slice(0, shown).join('') : message.text}
            {typing ? <span className="nc-caret" aria-hidden="true" /> : null}
          </p>
          {!typing && message.formula ? <Formula formula={message.formula} /> : null}
          {!typing && message.steps?.length ? <Steps steps={message.steps} /> : null}
          {!typing && message.refs.length ? <Refs refs={message.refs} onFollow={onFollow} /> : null}
        </div>
        {typing ? null : (
          <div className="nc-meta">
            <Time at={message.at} />
            <CopyButton message={message} />
          </div>
        )}
      </div>
    </div>
  );
});

interface MyMessageProps {
  message: MyMessageData;
  isNew: boolean;
  first: boolean;
  /** a picture has loaded (the list keeps to the newest message) */
  onLoad: () => void;
}

const MyMessage = memo(function MyMessage({ message, isNew, first, onLoad }: MyMessageProps) {
  const pictures = message.attachments.filter((a) => a.kind === 'image');
  const files = message.attachments.filter((a) => a.kind !== 'image');
  return (
    <div className={cx('nc-msg', 'nc-msg--me', first && 'is-first', isNew && 'is-new')} role="group" aria-label="You" data-hub="noora-message" data-from="me">
      <div className="nc-msg__body">
        {pictures.map((file) => (
          <Shot key={file.id} file={file} onLoad={onLoad} />
        ))}
        {files.map((file) => (
          <FileChip key={file.id} file={file} />
        ))}
        {message.text ? (
          <div className="nc-bubble">
            <p className="nc-bubble__text" dir="auto">
              {message.text}
            </p>
          </div>
        ) : null}
        <div className="nc-meta">
          <Time at={message.at} />
        </div>
      </div>
    </div>
  );
});

/** Before anything is asked: her, saying hello, and questions about the page the student is on. */
function Hello({ greeting, chips, onSuggest }: { greeting: Reply; chips: readonly string[]; onSuggest: (text: string) => void }) {
  return (
    <div className="nc-hello" data-hub="noora-empty">
      <img className="nc-hello__pose" src={poseUrl(EMPTY_POSE)} alt="" draggable={false} />
      <p className="nc-hello__text">{greeting.text}</p>
      <Chips title="For this page" list={chips} onPick={onSuggest} />
    </div>
  );
}

export interface MessageListProps {
  greeting: Reply;
  messages: Message[];
  pending: Pending | null;
  /** questions about the page the student is on */
  pageChips: readonly string[];
  /** messages with an id above this one arrive with a small entrance */
  newFrom: number;
  /** a suggestion chip was chosen */
  onSuggest: (text: string) => void;
  /** a "Where to look" link was followed */
  onFollow: () => void;
}

/** The scrolling list. It keeps itself at the newest message. */
export const MessageList = memo(function MessageList({ greeting, messages, pending, pageChips, newFrom, onSuggest, onFollow }: MessageListProps) {
  const list = useRef<HTMLDivElement>(null);
  const toNewest = useCallback(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, []);
  // The empty chat starts at its top (her hello); a conversation keeps to its newest message.
  useLayoutEffect(() => {
    if (messages.length || pending) toNewest();
  }, [messages, pending, toNewest]);

  const typing = pending && pending.phase === 'typing' ? pending : null;
  const resting = !pending || pending.phase === 'done';
  const last = messages[messages.length - 1];
  // After her last answer: the questions it suggests, or else the page's own.
  const own = last?.from === 'noora' && last.suggestions?.length ? last.suggestions : null;
  // Never offer what has just been asked.
  const after = useMemo(() => {
    const asked = new Set(messages.flatMap((m) => (m.from === 'me' ? [m.text.trim().toLowerCase()] : [])));
    return (own ?? pageChips).filter((s) => !asked.has(s.toLowerCase()));
  }, [messages, own, pageChips]);

  return (
    <div ref={list} className="nc-messages" data-hub="noora-messages">
      {messages.length === 0 && !pending ? <Hello greeting={greeting} chips={pageChips} onSuggest={onSuggest} /> : null}
      {messages.map((m, i) => {
        const first = messages[i - 1]?.from !== m.from;
        return m.from === 'me' ? (
          <MyMessage key={m.id} message={m} isNew={m.id > newFrom} first={first} onLoad={toNewest} />
        ) : (
          <NooraMessage key={m.id} message={m} shown={typing && typing.reply.id === m.id ? typing.shown : null} isNew={m.id > newFrom} first={first} onFollow={onFollow} />
        );
      })}
      {pending && pending.phase === 'thinking' ? <Thinking label={pending.label} /> : null}
      {resting && last?.from === 'noora' ? <Chips className="nc-chips--after" title={own ? 'Try asking' : 'For this page'} list={after} onPick={onSuggest} /> : null}
    </div>
  );
});
