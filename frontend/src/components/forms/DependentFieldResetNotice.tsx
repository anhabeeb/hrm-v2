import { AlertBanner } from "../ui/page-shell";

export function DependentFieldResetNotice({ message }: { message?: string | null }) {
  if (!message) return null;
  return <AlertBanner tone="info">{message}</AlertBanner>;
}
