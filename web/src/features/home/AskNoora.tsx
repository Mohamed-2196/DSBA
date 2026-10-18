// Home's "Ask Noora anything…": one line that opens Noora's own page with the question (/noora?q=…), or empty.
import { ArrowRight, ChatCircleDots } from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '../../ui';

export function AskNoora() {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    navigate(q ? `/noora?q=${encodeURIComponent(q)}` : '/noora');
  };
  return (
    <form className="home-ask" onSubmit={submit} role="search" aria-label="Ask Noora" data-hub="home-ask-noora">
      <ChatCircleDots className="home-ask__icon" weight="duotone" aria-hidden="true" />
      <label htmlFor={id} className="visually-hidden">
        Ask Noora anything
      </label>
      <input
        id={id}
        className="home-ask__input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask Noora anything…"
        maxLength={2000}
        autoComplete="off"
        enterKeyHint="send"
      />
      <IconButton
        type="submit"
        variant="primary"
        label={text.trim() ? 'Ask Noora' : 'Open Noora'}
        icon={ArrowRight}
        className="home-ask__go"
      />
    </form>
  );
}
