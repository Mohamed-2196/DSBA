import { forwardRef, useState } from 'react';
import { IconButton, TextField, glyph } from '../ui';
import type { TextFieldProps } from '../ui/Field';

export interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'trailing'> {
  /** 'current-password' to sign in, 'new-password' to choose one (password managers offer to save it) */
  autoComplete: 'current-password' | 'new-password';
}

/** A password with a button that shows it while the person checks what they typed. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(props, ref) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      type={shown ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      maxLength={256}
      trailing={
        <IconButton
          size="sm"
          icon={shown ? glyph.eyeOff : glyph.eye}
          label={shown ? 'Hide password' : 'Show password'}
          toggle
          active={shown}
          onClick={() => setShown((v) => !v)}
        />
      }
    />
  );
});
