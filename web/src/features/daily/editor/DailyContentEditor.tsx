// Manage → Daily puzzles (holders of content.edit): the themes and the weeks to come, each game's items, the word
// game's guess list, Nearest neighbour's vocabulary, and a preview of any day. A part is chosen with ?part=.
// Changes reach the days to come; a day that is out keeps its puzzles. Every change goes to the activity log.
// Admins also load a content file, for a new install with no puzzles yet.
import { CalendarBlank, Eye, FileArrowUp, PuzzlePiece } from '@phosphor-icons/react';
import { useState } from 'react';
import { useAuth } from '../../../auth';
import { useQueryParam } from '../../../state';
import { Button, Chip, EmptyState, QueryError, Skeleton, Panel, formatCount } from '../../../ui';
import { useDailyContent } from './api';
import { ContentFileDialog } from './ContentFileDialog';
import { ItemsPart } from './ItemsPart';
import { PreviewPart } from './PreviewPart';
import { ThemesPart } from './ThemesPart';
import { GAMES, type ContentGame } from './lib/items';
import './Editor.css';

type Part = 'themes' | ContentGame | 'preview';

const PARTS: readonly Part[] = ['themes', ...GAMES.map((g) => g.id), 'preview'];

function isPart(value: string): value is Part {
  return (PARTS as readonly string[]).includes(value);
}

export function DailyContentEditor() {
  const [param, setPart] = useQueryParam('part', 'themes');
  const part: Part = isPart(param) ? param : 'themes';
  const overview = useDailyContent();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  if (overview.isError) {
    return (
      <QueryError
        error={overview.error}
        title="Daily puzzles didn’t load"
        onRetry={() => void overview.refetch()}
        retrying={overview.isFetching}
        size="sm"
      />
    );
  }
  if (overview.isPending) {
    return (
      <Panel padding="md">
        <Skeleton lines={8} />
      </Panel>
    );
  }
  const data = overview.data;
  const total = (game: ContentGame) => data.themes.reduce((n, t) => n + t.counts[game], 0);
  const empty = GAMES.every((g) => total(g.id) === 0);
  const loadFile = isAdmin ? (
    <Button leadingIcon={FileArrowUp} variant={empty ? 'primary' : 'secondary'} onClick={() => setLoading(true)}>
      Load a content file
    </Button>
  ) : null;

  return (
    <div className="dcms">
      <div className="dcms__head">
        <p className="dcms__lede">
          The puzzles students play each day come from here. Changes reach the days to come; a day that is out keeps its
          puzzles, so nobody’s game changes under them.
        </p>
        {empty ? null : loadFile}
      </div>
      {empty ? (
        <Panel padding="none">
          <EmptyState
            size="sm"
            icon={PuzzlePiece}
            title="No puzzles yet"
            body={
              isAdmin
                ? 'Load the content file to start, or add puzzles game by game.'
                : 'Add puzzles game by game, or ask an admin to load the content file.'
            }
            action={loadFile}
          />
        </Panel>
      ) : null}
      {loading ? <ContentFileDialog themes={data.themes} onClose={() => setLoading(false)} /> : null}
      <nav className="dcms__nav" aria-label="Parts of Daily puzzles">
        <Chip
          selected={part === 'themes'}
          onChange={() => setPart('themes', { replace: true })}
          icon={CalendarBlank}
          count={data.themes.length}
        >
          Themes and weeks
        </Chip>
        {GAMES.map((g) => (
          <Chip
            key={g.id}
            selected={part === g.id}
            onChange={() => setPart(g.id, { replace: true })}
            count={total(g.id)}
          >
            {g.label}
          </Chip>
        ))}
        <Chip selected={part === 'preview'} onChange={() => setPart('preview', { replace: true })} icon={Eye}>
          Preview a day
        </Chip>
      </nav>
      {part === 'themes' ? (
        <ThemesPart overview={data} />
      ) : part === 'preview' ? (
        <PreviewPart overview={data} />
      ) : (
        <ItemsPart key={part} game={part} overview={data} />
      )}
      <p className="dcms__sizes">
        {formatCount(data.guessWords)} words in the guess list · {formatCount(data.vocabularyWords)} words in Nearest
        neighbour’s vocabulary
      </p>
    </div>
  );
}
