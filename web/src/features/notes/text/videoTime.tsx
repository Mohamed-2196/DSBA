// A time in the lesson's video, in a note's text (ST-44): "▶ 4:05". Written beside the video, the lesson panel's
// button puts the video's time at the cursor; tapping it there takes the video to that time. Anywhere else it is a
// link to the lesson that starts the video there (/modules/<id>/lessons/<lesson>?t=245). The API keeps it as a
// `videoTime` node with whole `seconds` (api/app/services/note_doc.py) and reads it as [4:05].
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { Icon, glyph } from '../../../ui';
import { VIDEO_TIME_MAX, VideoTimesContext, clockLabel, lessonAt } from './videoTimes';

function TimeView({ node }: ReactNodeViewProps) {
  const { seek, lesson } = useContext(VideoTimesContext);
  const seconds = Number(node.attrs.seconds) || 0;
  const label = clockLabel(seconds);
  const inner = (
    <>
      <Icon glyph={glyph.play} />
      {label}
    </>
  );
  let shown;
  if (seek) {
    shown = (
      <button
        type="button"
        className="nb-time"
        contentEditable={false}
        onClick={() => seek(seconds)}
        title={`Play the video from ${label}`}
        data-hub="note-video-time"
      >
        {inner}
      </button>
    );
  } else if (lesson) {
    shown = (
      <Link
        to={lessonAt(lesson.moduleId, lesson.lessonId, seconds)}
        className="nb-time"
        contentEditable={false}
        title={`Open the lesson at ${label}`}
        data-hub="note-video-time"
      >
        {inner}
      </Link>
    );
  } else {
    shown = (
      <span className="nb-time is-plain" data-hub="note-video-time">
        {inner}
      </span>
    );
  }
  return <NodeViewWrapper as="span">{shown}</NodeViewWrapper>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    videoTime: {
      /** the video's time at the cursor, then a space to type on */
      insertVideoTime: (seconds: number) => ReturnType;
    };
  }
}

export const VideoTime = Node.create({
  name: 'videoTime',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    seconds: {
      default: 0,
      parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-video-time')) || 0,
    },
  }),
  parseHTML: () => [{ tag: 'span[data-video-time]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-video-time': String(node.attrs.seconds) }),
    `[${clockLabel(Number(node.attrs.seconds) || 0)}]`,
  ],
  renderText: ({ node }) => `[${clockLabel(Number(node.attrs.seconds) || 0)}]`,
  addNodeView: () => ReactNodeViewRenderer(TimeView),
  addCommands() {
    return {
      insertVideoTime:
        (seconds) =>
        ({ commands }) =>
          commands.insertContent([
            {
              type: this.name,
              attrs: { seconds: Math.min(VIDEO_TIME_MAX, Math.max(0, Math.floor(seconds))) },
            },
            { type: 'text', text: ' ' },
          ]),
    };
  },
});
