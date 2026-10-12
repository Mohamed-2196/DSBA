"""The forum: threads, one level of replies, upvotes, accepted answers and the student reps' moderation.
Owner: community agent. The routers (app/routers/forum.py) stay thin: they check who is asking, call one function
here, commit once and return.

Where things live:
- taxonomy.py    categories and tags (GET /forum/meta), and the cohort a thread belongs to
- text.py        the forum's markdown as plain text (excerpts, the first picture, image references), input cleaning
- visibility.py  who sees which thread and reply, and the lookups that answer 404
- search.py      the forum list's full-text search
- queries.py     the thread list, hot and related threads, stats
- views.py       the ThreadSummary, ThreadDetail and Reply responses
- rules.py       what every write shares: validation, slugs, counters, rate limits, the audit helper
- images.py      forum pictures, attached to the post that shows them
- notices.py     the notifications the forum sends (replies, accepted answers, hidden posts) and takes back
- threads.py     writing threads: start, edit, delete, accept an answer, pin, lock, hide
- replies.py     writing replies: post, edit, delete, hide
- votes.py       upvotes on threads and replies
Reports (of threads, replies and library items) are app/services/reports.py."""
