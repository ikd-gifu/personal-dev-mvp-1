"use client";

import { LoginPageClientPresenter } from "./LoginPageClientPresenter";
import { useLoginClient } from "./useLoginClient";

export function LoginPageClientContainer() {
  const { handleLogin } = useLoginClient();

  return <LoginPageClientPresenter onLogin={handleLogin} />;
}
