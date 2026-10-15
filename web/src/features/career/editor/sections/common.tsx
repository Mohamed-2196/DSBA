// The id of a list item in the Career Navigator editor: fixed once saved (links, calendar dates and bundled logos use
// it), editable before.
import { useState } from 'react';
import { TextField } from '../../../../ui';
import { ID_PATTERN, savedIdsOf, type EditorSection, type RefKind } from '../doc';
import { useIsSaved, useRenameNew } from '../hooks';
import { useEditor } from '../state';

export function IdField({ section, kind, id, error }: { section: EditorSection; kind: RefKind | null; id: string; error?: string }) {
  const { doc } = useEditor();
  const isSaved = useIsSaved(section, id);
  const rename = useRenameNew(section, kind);
  const [text, setText] = useState(id);
  const [problem, setProblem] = useState<string | null>(null);
  if (isSaved) {
    return <TextField label="Id" hint="Used in links and by calendar dates. It can’t change once saved." value={id} readOnly error={error} />;
  }
  const commit = () => {
    const next = text.trim();
    if (next === id) return setProblem(null);
    if (!ID_PATTERN.test(next) || next.length > 64) return setProblem('Use lowercase letters and digits, with dashes between words.');
    if (savedIdsOf(doc, section).includes(next)) return setProblem('Another one already has this id.');
    setProblem(null);
    rename(id, next);
  };
  return (
    <TextField
      label="Id"
      hint="Short, lowercase, with dashes: it follows the name until you save, and can’t change after."
      value={text}
      onChange={(e) => setText(e.target.value.toLowerCase())}
      onBlur={commit}
      maxLength={64}
      error={problem ?? error}
    />
  );
}
