import { useMutation, type QueryKey } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";

export function useWorkspaceMutation<TData, TVariables>(input: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  updateKeys?: QueryKey[];
  invalidateKeys?: QueryKey[];
  applyResult?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}) {
  return useMutation<TData, Error, TVariables>({
    mutationFn: input.mutationFn,
    retry: false,
    onSuccess: (data, variables) => {
      input.applyResult?.(data, variables);
    },
    onError: (error, variables) => {
      input.onError?.(error, variables);
    },
    onSettled: () => {
      for (const key of input.updateKeys ?? []) void queryClient.refetchQueries({ queryKey: key, exact: true });
      for (const key of input.invalidateKeys ?? []) void queryClient.invalidateQueries({ queryKey: key });
    }
  });
}
