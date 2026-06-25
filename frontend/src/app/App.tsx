import { AuthProvider } from "../hooks/useAuth";
import { IdleTimeoutProvider } from "../hooks/useIdleTimeout";
import { AppRoutes } from "../routes/AppRoutes";

export function App() {
  return (
    <AuthProvider>
      <IdleTimeoutProvider>
        <AppRoutes />
      </IdleTimeoutProvider>
    </AuthProvider>
  );
}
