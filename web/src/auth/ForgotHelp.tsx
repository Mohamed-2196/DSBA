// The forgot-password step's ways back in: numbered while Google sign-in is on (Google, or an admin's reset link);
// with it off, the one way as a sentence, since a list of one has the reader looking for a step 2.
export function ForgotHelp({ googleSignIn }: { googleSignIn: boolean }) {
  if (!googleSignIn) {
    // the dialog's line above says "An admin can get you back in.", so "one" here is the admin
    return <p className="signin__step">Ask one for a reset link. It works once, within an hour.</p>;
  }
  return (
    <ol className="signin__help">
      <li>
        If your address is a Gmail or Google account, continue with Google. You’re signed in, and you can set a new
        password in Your account.
      </li>
      <li>Ask an admin for a reset link. It works once, within an hour.</li>
    </ol>
  );
}
