import { authorLabel, getAuthor } from '../data/authors';
import { AuthorAvatar } from './AuthorAvatar';

/** "Zainab K. is typing" while a classmate's reply is on its way. */
export function TypingIndicator({ authorIds = [] }) {
  if (!authorIds.length) return null;
  const authors = authorIds.map((id) => getAuthor(id));
  const names = authors.map(authorLabel);
  const text = names.length === 1 ? `${names[0]} is typing` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are typing`;
  return (
    <div className="forum-typing" role="status">
      <span className="forum-typing__avatars">
        {authors.map((a) => (
          <AuthorAvatar key={a.id} author={a} size="sm" />
        ))}
      </span>
      <span>{text}</span>
      <span className="forum-typing__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
