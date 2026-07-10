import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlert } from "../components/alerts/useAlert";
import { LoginBrandPanel } from "../components/brand/LoginBrandPanel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { APP_BRANDING } from "../config/branding";
import { ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const alerts = useAlert();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
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
      const user = await login({ email, password, rememberMe });
      alerts.showSuccess("Signed in", `Redirecting to ${APP_BRANDING.appName}.`);
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
    <main className="flex min-h-screen w-full flex-col bg-white lg:flex-row">
      <LoginBrandPanel />
      <section className="flex w-full flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:w-1/2" aria-label="Sign in form">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <img
              src="/brand/cafe-asiana-logo.jpg"
              alt="Cafe Asiana logo"
              className="mb-6 h-auto max-h-20 w-auto max-w-[240px] object-contain sm:max-h-24 sm:max-w-[280px]"
              draggable={false}
            />
            <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Welcome to Cafe Asiana&apos;s HRM System</h1>
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
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" className="h-3.5 w-3.5" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                Remember me
              </label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => alerts.showInfo("Forgot your password?", "Contact your HR administrator to reset it.")}
              >
                Forgot password?
              </button>
            </div>
            {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <Button type="submit" className="w-full" disabled={submitting} loading={submitting} loadingLabel="Signing in">
              Sign in
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}

function defaultLandingPath(user: { permissions: string[]; employee_id?: string | null; is_owner?: boolean } | null | undefined) {
  if (!user) return "/";
  if (user.is_owner || user.permissions.includes("dashboard.view")) return "/";
  if (user.employee_id && (user.permissions.includes("self_service.view") || user.permissions.some((permission) => permission.startsWith("self_service.")))) return "/self-service";
  return "/";
}
