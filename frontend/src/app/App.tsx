import { QueryClientProvider } from "@tanstack/react-query";
import { AlertProvider } from "../components/alerts/AlertProvider";
import { PinSetupModal } from "../components/auth/PinSetupModal";
import { AuthProvider } from "../hooks/useAuth";
import { IdleTimeoutProvider } from "../hooks/useIdleTimeout";
import { LiveQueryInvalidationBridge } from "../hooks/useLiveQueryInvalidation";
import { queryClient } from "../lib/queryClient";
import { AppRoutes } from "../routes/AppRoutes";

export function App() {
  return (
    <AlertProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <IdleTimeoutProvider>
            <LiveQueryInvalidationBridge />
            <PinSetupModal />
            <AppRoutes />
          </IdleTimeoutProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AlertProvider>
  );
}
