// The conversation as it is drawn: her messages on the left with her face, the student's on the right.
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../ui';
import { FileChip, Shot } from './Attachment';
import { Face } from './Face';
import { Formula, Steps } from './Formula';

/** "Where to look": links to the module, chapter or exact lesson. */
function Refs({ refs, onFollow }) {
  return (
    <div className="nc-refs" data-hub="noora-refs">
      <p className="nc-refs__title">Where to look</p>
      <ul role="list" className="nc-refs__list">
        {refs.map((ref, i) => (
          <li key={`${ref.code} ${ref.to}`} style={{ '--i': i }}>
            <Link to={ref.to} className="nc-ref" title={ref.label} onClick={onFollow}>
              <span className="nc-ref__code">{ref.code}</span>
              <span className="nc-ref__label">{ref.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thinking({ label }) {
  return (
    <div className="nc-msg nc-msg--noora is-new" data-hub="noora-thinking">
      <Face size={28} />
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

// Both kinds of message are memoised: while a reply streams in, only the bubble that is growing redraws.
const NooraMessage = memo(function NooraMessage({ message, shown, isNew, suggest, onSuggest, onFollow }) {
  // While she is still typing, `shown` is how many characters are on screen; after that it is null.
  const chars = useMemo(() => Array.from(message.text), [message.text]);
  const typing = shown != null;
  return (
    <div className={cx('nc-msg', 'nc-msg--noora', isNew && 'is-new')} role="group" aria-label="Mini Noora" data-hub="noora-message" data-from="noora">
      <Face size={28} />
      <div className="nc-msg__body">
        <div className="nc-bubble">
          <p className="nc-bubble__text">
            {typing ? chars.slice(0, shown).join('') : message.text}
            {typing ? <span className="nc-caret" aria-hidden="true" /> : null}
          </p>
          {!typing && message.formula ? <Formula formula={message.formula} /> : null}
          {!typing && message.steps?.length ? <Steps steps={message.steps} /> : null}
          {!typing && message.refs?.length ? <Refs refs={message.refs} onFollow={onFollow} /> : null}
        </div>
        {suggest && message.suggestions?.length ? (
          <div className="nc-suggest">
            {message.suggestions.map((s) => (
              <button key={s} type="button" className="nc-suggest__chip" onClick={() => onSuggest(s)} data-hub="noora-suggestion">
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

const MyMessage = memo(function MyMessage({ message, isNew, onLoad }) {
  const pictures = (message.attachments || []).filter((a) => a.kind === 'image');
  const files = (message.attachments || []).filter((a) => a.kind !== 'image');
  return (
    <div className={cx('nc-msg', 'nc-msg--me', isNew && 'is-new')} role="group" aria-label="You" data-hub="noora-message" data-from="me">
      <div className="nc-msg__body">
        {pictures.map((file) => (
          <Shot key={file.id} file={file} onLoad={onLoad} />
        ))}
        {files.map((file) => (
          <FileChip key={file.id} file={file} />
        ))}
        {message.text ? (
          <div className="nc-bubble">
            <p className="nc-bubble__text" dir="auto">{message.text}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
});

/**
 * The scrolling list. It keeps itself at the newest message.
 * @param messages, pending  from useChat()
 * @param newFrom            messages with an id above this one arrive with a small entrance
 * @param onSuggest(text)    a suggestion chip was chosen
 * @param onFollow()         a "Where to look" link was followed
 */
export const MessageList = memo(function MessageList({ messages, pending, newFrom, onSuggest, onFollow }) {
  const list = useRef(null);
  const toNewest = useCallback(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, []);
  useLayoutEffect(() => {
    toNewest();
  }, [messages, pending, toNewest]);

  const typing = pending && pending.phase === 'typing' ? pending : null;
  const resting = !pending || pending.phase === 'done';
  const last = messages[messages.length - 1];
  return (
    <div ref={list} className="nc-messages" data-hub="noora-messages">
      {messages.map((m) =>
        m.from === 'me' ? (
          <MyMessage key={m.id} message={m} isNew={m.id > newFrom} onLoad={toNewest} />
        ) : (
          <NooraMessage
            key={m.id}
            message={m}
            shown={typing && typing.reply.id === m.id ? typing.shown : null}
            isNew={m.id > newFrom}
            suggest={resting && m === last}
            onSuggest={onSuggest}
            onFollow={onFollow}
          />
        ),
      )}
      {pending && pending.phase === 'thinking' ? <Thinking label={pending.label} /> : null}
    </div>
  );
});
