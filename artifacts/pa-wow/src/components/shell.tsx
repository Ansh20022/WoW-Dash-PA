import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Database, FileBarChart2, LogOut, Users } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BrandMark } from "@/components/brand";

export function Shell({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const [loc] = useLocation();
  const { user, logout } = useAuth();
  const nav = [
    { href: "/", label: "Report", icon: FileBarChart2 },
    { href: "/data", label: "Data", icon: Database },
    ...(isAdmin ? [{ href: "/access", label: "Access", icon: Users }] : []),
  ];
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Account";
  const initials = name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 bg-[#10205b] text-white">
        <div className="mx-auto flex h-14 max-w-[1540px] items-center gap-4 px-4 md:px-6">
          <Link href="/" data-testid="link-home"><BrandMark /></Link>
          <nav className="ml-2 flex items-center gap-1 md:ml-6">
            {nav.map((n) => {
              const active = loc === n.href;
              return (
                <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase()}`}
                  className={`relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${active ? "bg-white/12 text-white" : "text-white/65 hover:text-white"}`}>
                  <n.icon className="h-4 w-4" /><span className="hidden sm:inline">{n.label}</span>
                  {active && <span className="absolute -bottom-[11px] left-3 right-3 h-[2px] bg-[#e0a800]" />}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-white/10" data-testid="button-account">
                <Avatar className="h-7 w-7">
                  {user?.profileImageUrl && <AvatarImage src={user.profileImageUrl} />}
                  <AvatarFallback className="bg-[#e0a800] text-[11px] font-semibold text-[#10205b]">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[160px] truncate text-xs md:inline">{name}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="truncate text-sm">{name}</div>
                  <div className="mt-1 break-all font-mono text-[11px] font-normal text-muted-foreground">ID {user?.id}</div>
                  <div className="mt-1 text-[11px] font-normal text-muted-foreground">{isAdmin ? "Administrator" : "Viewer"}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { if (user?.id) void navigator.clipboard.writeText(user.id).catch(() => undefined); }} data-testid="menu-copy-id">Copy account ID</DropdownMenuItem>
                <DropdownMenuItem onClick={logout} data-testid="menu-logout"><LogOut className="h-4 w-4" />Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
