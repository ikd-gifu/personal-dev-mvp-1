"use client";

import { Button } from "@/shared/components/ui/button";

type LoginPageClientPresenterProps = {
  onLogin: () => void;
};

export function LoginPageClientPresenter({
  onLogin,
}: LoginPageClientPresenterProps) {
  return (
    <Button type="button" onClick={onLogin}>
      Googleでログイン
    </Button>
  );
}
