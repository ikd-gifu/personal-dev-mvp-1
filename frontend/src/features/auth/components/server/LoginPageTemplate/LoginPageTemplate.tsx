import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { LoginPageClientContainer } from "../../client/LoginPageClient";

export function LoginPageTemplate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Mini Notion</CardTitle>
          <CardDescription>
            設計メモを構造化して残すミニノートアプリ
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <LoginPageClientContainer />
        </CardContent>
      </Card>
    </div>
  );
}
