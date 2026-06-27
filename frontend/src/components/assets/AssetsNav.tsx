import { useLocation } from "react-router-dom";
import { ModuleNavigationBar, ModuleNavigationItem } from "../ui/navigation-tabs";

const links = [
  ["Dashboard", "/assets"],
  ["Items", "/assets/items"],
  ["Assignments", "/assets/assignments"],
  ["Uniform Stock", "/assets/uniforms"],
  ["Uniform Assignments", "/assets/uniform-assignments"],
  ["Uniform Types", "/assets/uniform-types"],
  ["Categories", "/assets/categories"],
  ["Deduction rules", "/assets/deduction-rules"],
  ["Reports", "/assets/reports"]
] as const;

export function AssetsNav() {
  const location = useLocation();
  return (
    <ModuleNavigationBar label="Assets and uniforms navigation">
      {links.map(([label, to]) => (
        <ModuleNavigationItem key={to} to={to} active={location.pathname === to}>
          {label}
        </ModuleNavigationItem>
      ))}
    </ModuleNavigationBar>
  );
}
