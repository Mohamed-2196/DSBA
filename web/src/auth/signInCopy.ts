// The line under the sign-in dialog's title, for each step.
export type SignInStep = 'sign-in' | 'sign-up' | 'forgot' | 'profile';

export function dialogDescription(step: SignInStep, googleSignIn: boolean): string {
  if (step === 'profile') return 'This is how classmates see you on the forum and in the library.';
  if (step === 'sign-up')
    return 'Reading is open to everyone. An account lets you post, upload and keep your own things.';
  if (step === 'forgot') return googleSignIn ? 'There are two ways back in.' : 'An admin can get you back in.';
  return googleSignIn
    ? 'Continue with Google, or use your email address and password.'
    : 'Use your email address and password.';
}
