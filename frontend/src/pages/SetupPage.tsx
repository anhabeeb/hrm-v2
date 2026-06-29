import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function SetupPage() {
  const navigate = useNavigate();
  const { setupOwner } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await setupOwner({ name, email, password });
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Setup could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-[minmax(420px,520px)_1fr]">
      <section className="flex items-center border-r bg-white px-6 py-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Create Owner account</h1>
              <p className="text-sm text-muted-foreground">This account controls initial HRM v2 access.</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            </div>
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
                autoComplete="new-password"
                minLength={12}
                required
              />
            </div>
            {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <Button type="submit" className="w-full" disabled={submitting} loading={submitting} loadingLabel="Creating owner account">
              Complete setup
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>

      <section className="hidden items-center px-10 lg:flex">
        <Panel className="w-full max-w-3xl overflow-hidden">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Foundation checklist</p>
            <p className="text-xs text-muted-foreground">Prepared during first bootstrap</p>
          </div>
          <div className="divide-y">
            {["Protected Owner role", "Core RBAC permissions", "Audit log baseline", "Employee 360-ready user links"].map((item) => (
              <div key={item} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{item}</span>
                <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700">Ready</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}
