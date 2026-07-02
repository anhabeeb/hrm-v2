import { QueryClientProvider } from "@tanstack/react-query";
import { AlertProvider } from "../components/alerts/AlertProvider";
import { AuthProvider } from "../hooks/useAuth";
import { IdleTimeoutProvider } from "../hooks/useIdleTimeout";
import { queryClient } from "../lib/queryClient";
import { AppRoutes } from "../routes/AppRoutes";

export function App() {
  return (
    <AlertProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <IdleTimeoutProvider>
            <AppRoutes />
          </IdleTimeoutProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AlertProvider>
  );
}
