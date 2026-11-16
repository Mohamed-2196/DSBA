import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ForgotHelp } from './ForgotHelp';

const render = (googleSignIn: boolean) => renderToStaticMarkup(createElement(ForgotHelp, { googleSignIn }));

describe('ForgotHelp', () => {
  it('numbers the two ways back in when Google sign-in is on', () => {
    const html = render(true);
    expect(html).toContain('<ol class="signin__help">');
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('continue with Google');
    expect(html).toContain('Ask an admin for a reset link. It works once, within an hour.');
  });

  it('shows the one way back in as a sentence, not a list of one, when Google sign-in is off', () => {
    const html = render(false);
    expect(html).not.toContain('<ol');
    expect(html).toBe('<p class="signin__step">Ask one for a reset link. It works once, within an hour.</p>');
  });
});
