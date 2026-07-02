import { useQueryClient } from "@tanstack/react-query";
import { useAppEvents } from "./useAppEvents";
import { useAuth } from "./useAuth";

export function LiveQueryInvalidationBridge() {
  const { token, user, loading } = useAuth();
  const queryClient = useQueryClient();
  useAppEvents({
    token,
    user,
    enabled: Boolean(token && user && !loading),
    queryClient
  });
  return null;
}
