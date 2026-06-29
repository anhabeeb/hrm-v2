import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlert } from "../components/alerts/useAlert";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const alerts = useAlert();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const message = sessionStorage.getItem("hrm_v2_login_message");
    if (message) {
      if (/session/i.test(message)) alerts.showSessionExpired(message);
      else alerts.showInfo("Sign in required", message);
      sessionStorage.removeItem("hrm_v2_login_message");
    }
  }, [alerts]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setEmailError("");
    setPasswordError("");
    const nextEmailError = email.trim() ? "" : "Email is required.";
    const nextPasswordError = password ? "" : "Password is required.";
    if (nextEmailError || nextPasswordError) {
      setEmailError(nextEmailError);
      setPasswordError(nextPasswordError);
      setError("Please enter your email and password.");
      alerts.showValidationError("Please enter your email and password.", "Login details needed");
      setSubmitting(false);
      return;
    }
    try {
      const user = await login({ email, password });
      alerts.showSuccess("Signed in", "Redirecting to HRM.");
      navigate(defaultLandingPath(user), { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        const message = "Check your email and password.";
        setError(message);
        alerts.showError("Login failed", message);
      } else if (caught instanceof ApiError && (caught.code.includes("DISABLED") || caught.status === 403)) {
        const message = "Contact HR or your system administrator.";
        setError("Account disabled or not permitted.");
        alerts.showError("Account disabled", message);
      } else {
        setError(caught instanceof ApiError ? caught.message : "Login failed.");
        alerts.showApiError(caught, "Login failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-panel">
        <div className="mb-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LogIn className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">Sign in to HRM v2</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use your HRM access account.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" aria-invalid={Boolean(emailError) || undefined} />
            {emailError ? <p className="text-xs text-red-700">{emailError}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError) || undefined}
            />
            {passwordError ? <p className="text-xs text-red-700">{passwordError}</p> : null}
          </div>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Button type="submit" className="w-full" disabled={submitting} loading={submitting} loadingLabel="Signing in">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}

function defaultLandingPath(user: { permissions: string[]; employee_id?: string | null; is_owner?: boolean } | null | undefined) {
  if (!user) return "/";
  if (user.is_owner || user.permissions.includes("dashboard.view")) return "/";
  if (user.employee_id && (user.permissions.includes("self_service.view") || user.permissions.some((permission) => permission.startsWith("self_service.")))) return "/self-service";
  return "/";
}
