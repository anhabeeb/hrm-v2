import { Button, type ButtonProps } from "../ui/button";

export function LoadingButton({ loading, children, ...props }: ButtonProps & { loading?: boolean }) {
  return (
    <Button {...props} loading={loading}>
      {children}
    </Button>
  );
}
