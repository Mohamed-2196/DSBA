// "Ask Mini Noora" on a past paper: the student names a question and its page, and her panel opens with
// it. She reads that page of the paper and the examiners' report for its sitting (the API loads both). Shown only
// while her AI answers can take a question.
import { ChatCircleText } from '@phosphor-icons/react';
import { useRef, useState, type FormEvent } from 'react';
import { Button, IconButton, Modal, TextField } from '../../../ui';
import { askAboutPaper, PAPER_PAGE_MAX, questionNumber, useNooraAiReady } from '../../noora/public';
import type { LibraryItem } from '../types';

export function AskNoora({ item, page, compact }: { item: LibraryItem; page: number | null; compact: boolean }) {
  const ready = useNooraAiReady();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  if (!ready || item.kind !== 'past-paper' || item.source !== 'file' || item.status !== 'published') return null;

  const start = (from: HTMLElement) => {
    opener.current = from;
    setOpen(true);
  };
  return (
    <>
      {compact ? (
        <IconButton label="Ask Mini Noora about a question" icon={ChatCircleText} onClick={(e) => start(e.currentTarget)} data-hub="file-ask-noora" />
      ) : (
        <Button leadingIcon={ChatCircleText} onClick={(e) => start(e.currentTarget)} data-hub="file-ask-noora">
          Ask Mini Noora
        </Button>
      )}
      {open ? (
        <AskDialog
          item={item}
          page={page}
          onClose={() => setOpen(false)}
          onAsk={(question, at) => {
            setOpen(false);
            askAboutPaper({ itemId: item.id, title: item.title, page: at, question }, opener.current);
          }}
        />
      ) : null}
    </>
  );
}

function AskDialog({ item, page, onClose, onAsk }: { item: LibraryItem; page: number | null; onClose: () => void; onAsk: (question: string, page: number) => void }) {
  const [question, setQuestion] = useState('');
  const [at, setAt] = useState(String(page ?? 1));
  const [tried, setTried] = useState(false);
  const number = questionNumber(question);
  const pageNumber = /^\d{1,3}$/.test(at.trim()) ? Number(at.trim()) : 0;
  const pageOk = pageNumber >= 1 && pageNumber <= PAPER_PAGE_MAX;
  const first = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (number && pageOk) onAsk(number, pageNumber);
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Ask Mini Noora about a question"
      description={`She reads that page of “${item.title}” and the examiners’ report for the same exam, if the library has it.`}
      initialFocusRef={first}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="lib-ask-noora">
            Ask Mini Noora
          </Button>
        </>
      }
    >
      <form id="lib-ask-noora" className="lib-ask" onSubmit={submit} noValidate data-hub="file-ask-form">
        <TextField
          ref={first}
          label="Question"
          placeholder="2(b)"
          hint="As the paper numbers it."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          error={tried && !number ? 'Type the question’s number, like 2(b).' : undefined}
          autoComplete="off"
          maxLength={24}
          required
        />
        <TextField
          label="Page"
          hint="The page of the PDF it’s on."
          inputMode="numeric"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          error={tried && !pageOk ? `Type a page from 1 to ${PAPER_PAGE_MAX}.` : undefined}
          autoComplete="off"
          maxLength={3}
          required
        />
      </form>
    </Modal>
  );
}
