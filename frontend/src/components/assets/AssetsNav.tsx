import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";

const links = [
  ["Dashboard", "/assets"],
  ["Items", "/assets/items"],
  ["Assignments", "/assets/assignments"],
  ["Categories", "/assets/categories"],
  ["Deduction rules", "/assets/deduction-rules"],
  ["Reports", "/assets/reports"]
] as const;

export function AssetsNav() {
  const location = useLocation();
  return (
    <div className="flex overflow-x-auto border-b">
      {links.map(([label, to]) => (
        <Link key={to} to={to} className={cn("h-10 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium", location.pathname === to ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50")}>
          {label}
        </Link>
      ))}
    </div>
  );
}
