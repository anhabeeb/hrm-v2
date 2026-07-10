import { useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { APP_BRANDING } from "../../config/branding";
import { useAuth } from "../../hooks/useAuth";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function PinSetupModal() {
  const { pinSetupPending, setupPin, dismissPinSetup } = useAuth();
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPin("");
    setPinConfirm("");
    setError("");
    setSubmitting(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(pin)) {
      setError("PIN must be exactly 6 digits.");
      return;
    }
    if (pin !== pinConfirm) {
      setError("PINs do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await setupPin(pin);
      reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not set up PIN.");
      setSubmitting(false);
    }
  }

  function skip() {
    dismissPinSetup();
    reset();
  }

  return (
    <Dialog open={pinSetupPending} onOpenChange={(open) => !open && skip()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Set a PIN for quick access</DialogTitle>
          <DialogDescription>Use this 6-digit PIN to unlock {APP_BRANDING.appName} on this device instead of your full password.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="modal-pin">PIN</Label>
              <Input id="modal-pin" value={pin} onChange={(event) => setPin(digitsOnly(event.target.value))} type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="••••••" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-pin-confirm">Confirm PIN</Label>
              <Input id="modal-pin-confirm" value={pinConfirm} onChange={(event) => setPinConfirm(digitsOnly(event.target.value))} type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="••••••" />
            </div>
            {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={skip} disabled={submitting}>
              Skip for now
            </Button>
            <Button type="submit" disabled={submitting} loading={submitting} loadingLabel="Saving">
              Set PIN
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
