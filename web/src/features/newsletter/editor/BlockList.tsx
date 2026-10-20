// The copy of a section in the editor: paragraphs, bulleted lists, the editors' sign-off, buttons and polls (while
// newsletter.polls is on), each a small form of its own, with Add, Move up/down and Remove.
import {
  ChartBar,
  ListBullets,
  Signature,
  TextAlignLeft,
  CursorClick,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { useAuth } from '../../../auth';
import { Button, cx, glyph, Icon, Switch } from '../../../ui';
import {
  LIMITS,
  blankBlock,
  blankItem,
  fieldPath,
  firstField,
  moveByKey,
  removeByKey,
  updateByKey,
  type BlockDraft,
  type BlockKind,
  type FieldErrors,
} from '../lib/draft';
import { ItemTools, TextBox, TextInput } from './fields';
import { useHasVotes } from './pollVotes';

const BLOCK_KINDS: {
  type: BlockKind;
  label: string;
  add: string;
  icon: PhosphorIcon;
}[] = [
  { type: 'p', label: 'Paragraph', add: 'Paragraph', icon: TextAlignLeft },
  { type: 'list', label: 'Bulleted list', add: 'List', icon: ListBullets },
  { type: 'signoff', label: 'Sign-off', add: 'Sign-off', icon: Signature },
  { type: 'cta', label: 'Button', add: 'Button', icon: CursorClick },
  { type: 'poll', label: 'Poll', add: 'Poll', icon: ChartBar },
];

const kindOf = (type: BlockKind) => BLOCK_KINDS.find((k) => k.type === type) ?? BLOCK_KINDS[0];

type Blocks = BlockDraft[];

interface BlockFormProps {
  sectionKey: string;
  block: BlockDraft;
  errors: FieldErrors;
  onChange: (fn: (b: BlockDraft) => BlockDraft) => void;
}

function ListItems({
  sectionKey,
  block,
  errors,
  onChange,
}: BlockFormProps & { block: Extract<BlockDraft, { type: 'list' }> }) {
  const setItems = (fn: (items: typeof block.items) => typeof block.items) =>
    onChange((b) => (b.type === 'list' ? { ...b, items: fn(b.items) } : b));
  const itemsError = errors[fieldPath.block(sectionKey, block.key, 'items')];
  return (
    <div className="nl-ed-items">
      <ol className="nl-ed-items__list">
        {block.items.map((item, i) => (
          <li key={item.key} className="nl-ed-item">
            <TextBox
              path={fieldPath.item(sectionKey, block.key, item.key)}
              errors={errors}
              label={`Item ${i + 1}`}
              hideLabel
              rows={1}
              max={LIMITS.item}
              value={item.text}
              onValue={(text) => setItems((items) => updateByKey(items, item.key, (x) => ({ ...x, text })))}
              className="nl-ed-item__field"
            />
            <ItemTools
              name={`item ${i + 1}`}
              first={i === 0}
              last={i === block.items.length - 1}
              onMove={(dir) => setItems((items) => moveByKey(items, item.key, dir))}
              onRemove={() => setItems((items) => removeByKey(items, item.key))}
              className="nl-ed-item__tools"
            />
          </li>
        ))}
      </ol>
      {itemsError ? (
        <p className="nl-ed-error" tabIndex={-1}>
          {itemsError}
        </p>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        leadingIcon={<Icon glyph={glyph.plus} />}
        disabled={block.items.length >= LIMITS.items}
        onClick={() => setItems((items) => [...items, blankItem()])}
      >
        Add an item
      </Button>
    </div>
  );
}

function PollForm({
  sectionKey,
  block,
  errors,
  onChange,
}: BlockFormProps & { block: Extract<BlockDraft, { type: 'poll' }> }) {
  const setAnswers = (fn: (answers: typeof block.answers) => typeof block.answers) =>
    onChange((b) => (b.type === 'poll' ? { ...b, answers: fn(b.answers) } : b));
  const answersError = errors[fieldPath.block(sectionKey, block.key, 'answers')];
  const locked = useHasVotes(block.id);
  return (
    <>
      <TextInput
        path={fieldPath.block(sectionKey, block.key, 'question')}
        errors={errors}
        label="Question"
        max={LIMITS.heading}
        placeholder="Which Saturday suits a revision session?"
        hint="Each student votes once and sees the counts after voting. Nobody sees who voted."
        value={block.question}
        onValue={(question) => onChange((b) => (b.type === 'poll' ? { ...b, question } : b))}
      />
      <div className="nl-ed-items">
        <ol className="nl-ed-items__list">
          {block.answers.map((answer, i) => (
            <li key={answer.key} className="nl-ed-item">
              <TextInput
                path={fieldPath.item(sectionKey, block.key, answer.key)}
                errors={errors}
                label={`Answer ${i + 1}`}
                hideLabel
                max={LIMITS.pollAnswer}
                value={answer.text}
                onValue={(text) => setAnswers((answers) => updateByKey(answers, answer.key, (x) => ({ ...x, text })))}
                className="nl-ed-item__field"
                disabled={locked}
              />
              {locked ? null : (
                <ItemTools
                  name={`answer ${i + 1}`}
                  first={i === 0}
                  last={i === block.answers.length - 1}
                  onMove={(dir) => setAnswers((answers) => moveByKey(answers, answer.key, dir))}
                  onRemove={() => setAnswers((answers) => removeByKey(answers, answer.key))}
                  className="nl-ed-item__tools"
                />
              )}
            </li>
          ))}
        </ol>
        {locked ? (
          <p className="nl-ed-note">
            This poll has votes, so its answers are fixed. You can still edit the question or close it.
          </p>
        ) : null}
        {answersError ? (
          <p className="nl-ed-error" tabIndex={-1}>
            {answersError}
          </p>
        ) : null}
        {locked ? null : (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Icon glyph={glyph.plus} />}
            disabled={block.answers.length >= LIMITS.pollAnswers}
            onClick={() => setAnswers((answers) => [...answers, blankItem()])}
          >
            Add an answer
          </Button>
        )}
      </div>
      <Switch
        checked={block.closed}
        onChange={(closed) => onChange((b) => (b.type === 'poll' ? { ...b, closed } : b))}
        label="Closed"
        description="No more votes. Everyone sees the results."
        className="nl-ed-switch"
      />
    </>
  );
}

function BlockForm({ sectionKey, block, errors, onChange }: BlockFormProps) {
  const path = (field: string) => fieldPath.block(sectionKey, block.key, field);
  switch (block.type) {
    case 'p':
      return (
        <>
          <TextBox
            path={path('text')}
            errors={errors}
            label="Text"
            hideLabel
            rows={3}
            max={LIMITS.paragraph}
            value={block.text}
            onValue={(text) => onChange((b) => (b.type === 'p' ? { ...b, text } : b))}
          />
          <Switch
            checked={block.lead}
            onChange={(lead) => onChange((b) => (b.type === 'p' ? { ...b, lead } : b))}
            label="Opening paragraph"
            description="Set larger, with a drop capital."
            className="nl-ed-switch"
          />
        </>
      );
    case 'list':
      return <ListItems sectionKey={sectionKey} block={block} errors={errors} onChange={onChange} />;
    case 'poll':
      return <PollForm sectionKey={sectionKey} block={block} errors={errors} onChange={onChange} />;
    case 'signoff':
      return (
        <TextInput
          path={path('text')}
          errors={errors}
          label="Sign-off"
          hideLabel
          max={LIMITS.line}
          hint="The editors’ initials show beside it."
          placeholder="Hawra, Zainab and Hussain, for the editorial team"
          value={block.text}
          onValue={(text) => onChange((b) => (b.type === 'signoff' ? { ...b, text } : b))}
        />
      );
    case 'cta':
      return (
        <div className="nl-ed-grid">
          <TextInput
            path={path('label')}
            errors={errors}
            label="What it says"
            max={LIMITS.label}
            placeholder="Open the calendar"
            value={block.label}
            onValue={(label) => onChange((b) => (b.type === 'cta' ? { ...b, label } : b))}
          />
          <TextInput
            path={path('to')}
            errors={errors}
            label="Where it goes"
            inputMode="url"
            autoComplete="off"
            placeholder="/calendar"
            hint="A page of the Hub (like /library?upload=1), an https:// address or a mailto: link."
            value={block.to}
            onValue={(to) => onChange((b) => (b.type === 'cta' ? { ...b, to } : b))}
          />
        </div>
      );
  }
}

export interface BlockListProps {
  sectionKey: string;
  /** names the list for its buttons: 'the story', 'after the list' */
  title: string;
  blocks: Blocks;
  max: number;
  errors: FieldErrors;
  /** where its count error shows (fieldPath.section(key, 'blocks' | 'after')) */
  path: string;
  onChange: (fn: (blocks: Blocks) => Blocks) => void;
  /** ask for focus on a new block's first field */
  onFocus: (path: string) => void;
}

/** A section's blocks, each a small form, with Add, Move and Remove. */
export function BlockList({ sectionKey, title, blocks, max, errors, path, onChange, onFocus }: BlockListProps) {
  const counts: Partial<Record<BlockKind, number>> = {};
  const pollsOn = useAuth().featureOn('newsletter.polls');
  const kinds = BLOCK_KINDS.filter((k) => k.type !== 'poll' || pollsOn);
  const add = (type: BlockKind) => {
    const block = blankBlock(type);
    onChange((list) => [...list, block]);
    onFocus(
      block.type === 'list'
        ? fieldPath.item(sectionKey, block.key, block.items[0]?.key ?? '')
        : fieldPath.block(sectionKey, block.key, firstField(block)),
    );
  };
  return (
    <div className="nl-ed-blocks">
      {blocks.length ? (
        <ol className="nl-ed-blocks__list" aria-label={title}>
          {blocks.map((block, i) => {
            const kind = kindOf(block.type);
            const n = (counts[block.type] = (counts[block.type] ?? 0) + 1);
            const name = `${kind.label.toLowerCase()} ${n}`;
            const Glyph = kind.icon;
            return (
              <li key={block.key} className={cx('nl-ed-block', `nl-ed-block--${block.type}`)} data-hub="editor-block">
                <div className="nl-ed-block__head">
                  <p className="nl-ed-block__type">
                    <Glyph aria-hidden="true" weight="duotone" />
                    {kind.label}
                  </p>
                  <ItemTools
                    name={name}
                    first={i === 0}
                    last={i === blocks.length - 1}
                    onMove={(dir) => onChange((list) => moveByKey(list, block.key, dir))}
                    onRemove={() => onChange((list) => removeByKey(list, block.key))}
                  />
                </div>
                <BlockForm
                  sectionKey={sectionKey}
                  block={block}
                  errors={errors}
                  onChange={(fn) => onChange((list) => updateByKey(list, block.key, fn))}
                />
              </li>
            );
          })}
        </ol>
      ) : null}
      {errors[path] ? (
        <p className="nl-ed-error" tabIndex={-1}>
          {errors[path]}
        </p>
      ) : null}
      <div className="nl-ed-add" role="group" aria-label={`Add to ${title}`}>
        <span className="nl-ed-add__label" aria-hidden="true">
          Add
        </span>
        {kinds.map((k) => (
          <Button
            key={k.type}
            size="sm"
            variant="secondary"
            leadingIcon={k.icon}
            disabled={blocks.length >= max}
            onClick={() => add(k.type)}
            aria-label={`Add a ${k.label.toLowerCase()} to ${title}`}
          >
            {k.add}
          </Button>
        ))}
      </div>
    </div>
  );
}
