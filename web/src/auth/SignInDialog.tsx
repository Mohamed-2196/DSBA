// Placeholder: the accounts frontend agent builds the dialog (identifier → 6-digit code → profile step).
// Contract: shown while `request` is not null; on success it calls request.onSuccess?.() and then onClose().
import type { SignInRequest } from './context';

export interface SignInDialogProps {
  request: SignInRequest | null;
  onClose: () => void;
}

export function SignInDialog(_props: SignInDialogProps) {
  return null;
}
