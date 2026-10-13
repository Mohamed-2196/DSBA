import { useCallback, useRef } from 'react';
import type { MutateOptions, UseMutationResult } from '@tanstack/react-query';

/**
 * `mutation.mutate`, but a call made while the last one is still in flight is ignored. `isPending` only changes on
 * the next render, so without this a double click or a double tap sends the request twice.
 */
export function useSingleFlight<TData, TError, TVariables, TContext>(
  mutation: UseMutationResult<TData, TError, TVariables, TContext>,
): (variables: TVariables, options?: MutateOptions<TData, TError, TVariables, TContext>) => void {
  const busy = useRef(false);
  const { mutate } = mutation;
  return useCallback(
    (variables, options) => {
      if (busy.current) return;
      busy.current = true;
      mutate(variables, {
        ...options,
        onSettled: (...args) => {
          busy.current = false;
          options?.onSettled?.(...args);
        },
      });
    },
    [mutate],
  );
}
