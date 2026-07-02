import { useMutation, type QueryKey } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";

const SENSITIVE_OPTIMISTIC_ACTIONS = [
  /activate/i,
  /approve/i,
  /override/i,
  /finalize/i,
  /delete/i,
  /archive/i,
  /permission/i,
  /payroll/i,
  /security/i,
  /contract/i,
  /settlement/i
];

export function isSensitiveOptimisticAction(actionKey: string) {
  return SENSITIVE_OPTIMISTIC_ACTIONS.some((pattern) => pattern.test(actionKey));
}

export function useApiMutation<TData, TVariables>(input: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidateKeys?: QueryKey[];
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}) {
  return useMutation<TData, Error, TVariables>({
    mutationFn: input.mutationFn,
    retry: false,
    onSuccess: (data, variables) => {
      input.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      input.onError?.(error, variables);
    },
    onSettled: () => {
      for (const key of input.invalidateKeys ?? []) void queryClient.invalidateQueries({ queryKey: key });
    }
  });
}

export function useOptimisticApiMutation<TData, TVariables, TSnapshot>(input: {
  actionKey: string;
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidateKeys: QueryKey[];
  createSnapshot: () => TSnapshot;
  applyOptimisticUpdate: (variables: TVariables) => void;
  rollback: (snapshot: TSnapshot) => void;
  reconcile?: (data: TData, variables: TVariables) => void;
}) {
  if (isSensitiveOptimisticAction(input.actionKey)) {
    throw new Error(`Optimistic mutation is not allowed for sensitive action: ${input.actionKey}`);
  }
  return useMutation<TData, Error, TVariables, TSnapshot>({
    mutationFn: input.mutationFn,
    retry: false,
    onMutate: async (variables) => {
      await Promise.all(input.invalidateKeys.map((key) => queryClient.cancelQueries({ queryKey: key })));
      const snapshot = input.createSnapshot();
      input.applyOptimisticUpdate(variables);
      return snapshot;
    },
    onError: (_error, _variables, snapshot) => {
      if (snapshot !== undefined) input.rollback(snapshot);
    },
    onSuccess: (data, variables) => {
      input.reconcile?.(data, variables);
    },
    onSettled: () => {
      for (const key of input.invalidateKeys) void queryClient.invalidateQueries({ queryKey: key });
    }
  });
}
