import { describe, expect, it } from 'vitest';
import { AnswerCutOff, readAnswer } from './ai';

/** A response body that arrives in these chunks. */
function body(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe('readAnswer', () => {
  it('passes each piece on and resolves with the questions left', async () => {
    const pieces: string[] = [];
    const left = await readAnswer(
      body(
        'data: {"type":"text","text":"Hel',
        'lo "}\n\ndata: {"type":"text","text":"there."}\n\n',
        ': ping\n\ndata: {"type":"done","questionsLeft":12}\n\n',
      ),
      (t) => pieces.push(t),
    );
    expect(pieces).toEqual(['Hello ', 'there.']);
    expect(left).toBe(12);
  });

  it('stops with what was said when the answer breaks off', async () => {
    const error = await readAnswer(
      body(
        'data: {"type":"text","text":"Half"}\n\ndata: {"type":"error","code":"noora_unavailable","message":"Cut off."}\n\n',
      ),
      () => undefined,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnswerCutOff);
    expect(error).toMatchObject({ message: 'Cut off.', said: true, declined: false });
  });

  it('marks an answer her safeguards declined', async () => {
    const error = await readAnswer(
      body(
        'data: {"type":"text","text":"Some"}\n\ndata: {"type":"error","code":"noora_declined","message":"I can’t help with that one."}\n\n',
      ),
      () => undefined,
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ message: 'I can’t help with that one.', said: true, declined: true });
  });

  it('counts a stream that ends without done as cut off', async () => {
    const error = await readAnswer(body(''), () => undefined).catch((e: unknown) => e);
    expect(error).toMatchObject({ said: false });
  });
});
