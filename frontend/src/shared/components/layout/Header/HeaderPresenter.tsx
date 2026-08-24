"use client";

import { LogOut } from "lucide-react";
import type { AccountResponse } from "@/external/dto/account/account-dto";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

type HeaderPresenterProps = {
  account: AccountResponse | undefined;
  onLogout: () => void;
};

export function HeaderPresenter({ account, onLogout }: HeaderPresenterProps) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <span className="font-semibold">Mini Notion</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar>
            <AvatarImage src={account?.thumbnail} alt={account?.fullName} />
            <AvatarFallback>
              {account?.fullName?.charAt(0) ?? ""}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="flex flex-col">
            <span className="font-medium">{account?.fullName}</span>
            <span className="font-normal text-muted-foreground text-xs">
              {account?.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout}>
            <LogOut />
            ログアウト
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
