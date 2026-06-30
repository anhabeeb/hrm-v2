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
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-[1380px] grid-cols-1 items-center gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:py-0">
        <LoginBrandPanel />
        <div className="hidden h-[min(560px,72vh)] w-px bg-slate-200 lg:block" aria-hidden="true" />
        <section className="flex w-full justify-center px-4 py-6 sm:px-6 lg:px-8" aria-label="Sign in form">
          <div className="flex w-full max-w-[640px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-panel sm:px-10 lg:min-h-[560px]">
            <div className="w-full max-w-sm">
              <div className="mb-8 flex flex-col items-center text-center">
                <img
                  src="/brand/cafe-asiana-logo.jpg"
                  alt="Cafe Asiana logo"
                  className="mb-5 h-auto max-h-24 w-auto max-w-[260px] object-contain sm:max-h-28 sm:max-w-[320px] lg:max-h-32 lg:max-w-[360px]"
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
                {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
                <Button type="submit" className="w-full" disabled={submitting} loading={submitting} loadingLabel="Signing in">
                  Sign in
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function defaultLandingPath(user: { permissions: string[]; employee_id?: string | null; is_owner?: boolean } | null | undefined) {
  if (!user) return "/";
  if (user.is_owner || user.permissions.includes("dashboard.view")) return "/";
  if (user.employee_id && (user.permissions.includes("self_service.view") || user.permissions.some((permission) => permission.startsWith("self_service.")))) return "/self-service";
  return "/";
}
