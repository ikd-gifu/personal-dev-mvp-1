import { LoginPageClientContainer } from "../../client/LoginPageClient";

export function LoginPageTemplate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Mini Notion</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        設計メモを構造化して残すミニノートアプリ
      </p>
      <LoginPageClientContainer />
    </div>
  );
}
