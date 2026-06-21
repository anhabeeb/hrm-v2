import { AuthProvider } from "../hooks/useAuth";
import { AppRoutes } from "../routes/AppRoutes";

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
