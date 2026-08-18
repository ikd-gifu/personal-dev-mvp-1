"use client";

type LoginPageClientPresenterProps = {
  onLogin: () => void;
};

export function LoginPageClientPresenter({
  onLogin,
}: LoginPageClientPresenterProps) {
  return (
    <button
      type="button"
      onClick={onLogin}
      className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
    >
      Googleでログイン
    </button>
  );
}
