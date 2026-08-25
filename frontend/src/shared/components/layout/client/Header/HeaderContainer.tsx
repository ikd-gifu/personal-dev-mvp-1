"use client";

import { HeaderPresenter } from "./HeaderPresenter";
import { useHeader } from "./useHeader";

export function HeaderContainer() {
  const { account, handleLogout } = useHeader();

  return <HeaderPresenter account={account} onLogout={handleLogout} />;
}
