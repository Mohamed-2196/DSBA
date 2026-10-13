import { Face } from './Face';

/** Her face in a small round frame, for a launcher's icon. */
export function NooraAvatar({ size = 24, className }: { size?: number; className?: string }) {
  return <Face size={size} className={className} />;
}
