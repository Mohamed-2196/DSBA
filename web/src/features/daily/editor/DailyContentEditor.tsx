// Manage → Daily puzzles (holders of content.edit): the themes and the weeks to come, each game's items, the word
// game's guess list, Nearest neighbour's vocabulary, and a preview of any day. A part is chosen with ?part=.
// Changes reach the days to come; a day that is out keeps its puzzles. Every change goes to the activity log.
import { CalendarBlank, Eye } from '@phosphor-icons/react';
import { useQueryParam } from '../../../state';
import { Chip, QueryError, Skeleton, Panel, formatCount } from '../../../ui';
import { useDailyContent } from './api';
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

  if (overview.isError) {
    return <QueryError error={overview.error} title="Daily puzzles didn’t load" onRetry={() => void overview.refetch()} retrying={overview.isFetching} size="sm" />;
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

  return (
    <div className="dcms">
      <p className="dcms__lede">
        The puzzles students play each day come from here. Changes reach the days to come; a day that is out keeps its puzzles, so nobody’s game changes under them.
      </p>
      <nav className="dcms__nav" aria-label="Parts of Daily puzzles">
        <Chip selected={part === 'themes'} onChange={() => setPart('themes', { replace: true })} icon={CalendarBlank} count={data.themes.length}>
          Themes and weeks
        </Chip>
        {GAMES.map((g) => (
          <Chip key={g.id} selected={part === g.id} onChange={() => setPart(g.id, { replace: true })} count={total(g.id)}>
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
        {formatCount(data.guessWords)} words in the guess list · {formatCount(data.vocabularyWords)} words in Nearest neighbour’s vocabulary
      </p>
    </div>
  );
}
