import { AlertProvider } from "../components/alerts/AlertProvider";
import { AuthProvider } from "../hooks/useAuth";
import { IdleTimeoutProvider } from "../hooks/useIdleTimeout";
import { AppRoutes } from "../routes/AppRoutes";

export function App() {
  return (
    <AlertProvider>
      <AuthProvider>
        <IdleTimeoutProvider>
          <AppRoutes />
        </IdleTimeoutProvider>
      </AuthProvider>
    </AlertProvider>
  );
}
