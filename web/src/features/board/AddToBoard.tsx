import { useNavigate } from 'react-router-dom';
import type { BoardLinkIn } from '../../api/types';
import { errorMessage, isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { Button, type ButtonSize, Icon, glyph } from '../../ui';
import { useAddCard, useBoardLinks } from './api';

export interface AddToBoardProps {
  /** what the card points at: a calendar event, one of the student's own events, a lesson ('<module>:<chapter>:<video>'), a module or a library item */
  link: BoardLinkIn;
  size?: ButtonSize;
  className?: string;
}

/** "Add to my board" for a thing in the hub, or "On your board" once it's there. The caller gates it with
 *  featureOn('board'). Guests are asked to sign in first. */
export function AddToBoard({ link, size = 'sm', className }: AddToBoardProps) {
  const { status, requireAuth } = useAuth();
  const signedIn = status === 'signed-in';
  const links = useBoardLinks({ enabled: signedIn });
  const add = useAddCard();
  const toast = useToast();
  const navigate = useNavigate();
  const match = links.data?.find((l) => l.type === link.type && l.id === link.id);
  const onBoard = !!match;

  if (onBoard) {
    const to = match.boardId ? `/board?board=${match.boardId}&card=${match.cardId}` : '/board';
    return (
      <Button
        size={size}
        variant="ghost"
        to={to}
        leadingIcon={<Icon glyph={glyph.success} />}
        className={className}
        data-hub="board-on"
      >
        On your board
      </Button>
    );
  }

  const run = () =>
    add.mutate(
      { link, priority: 'none' },
      {
        onSuccess: (card) =>
          toast.push({
            tone: 'success',
            title: card.doneAt ? 'Added to Done on your board' : 'Added to your board',
            action: {
              label: 'Open board',
              onClick: () => void navigate(`/board?board=${card.boardId}&card=${card.id}`),
            },
          }),
        onError: (e) => {
          if (isApiError(e) && e.code === 'already_on_board') return; // the board links reload, and this becomes "On your board"
          toast.push({ tone: 'alert', title: 'It wasn’t added to your board', body: errorMessage(e) });
        },
      },
    );

  return (
    <Button
      size={size}
      leadingIcon={<Icon glyph={glyph.boards} />}
      loading={add.isPending}
      className={className}
      data-hub="board-add"
      onClick={() => {
        if (!requireAuth('Sign in to add this to a board', run)) return;
        run();
      }}
    >
      Add to my board
    </Button>
  );
}
