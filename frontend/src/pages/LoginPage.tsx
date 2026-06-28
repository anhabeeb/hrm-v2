import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const message = sessionStorage.getItem("hrm_v2_login_message");
    if (message) {
      setNotice(message);
      sessionStorage.removeItem("hrm_v2_login_message");
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const user = await login({ email, password });
      navigate(defaultLandingPath(user), { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Login failed.");
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
            <Input id="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {notice ? <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">{notice}</div> : null}
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in" : "Sign in"}
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
