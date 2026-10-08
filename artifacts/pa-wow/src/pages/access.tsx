import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, Trash2, UserPlus, Users } from "lucide-react";
import { getListInvitationsQueryKey, useCreateInvitation, useListInvitations, useRevokeInvitation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CopyButton } from "@/components/copy-button";
import { useToast } from "@/hooks/use-toast";
import { appUrl, errMsg, fmtDate, isPreviewHost } from "@/lib/format";

export default function AccessPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListInvitations();
  const [userId, setUserId] = useState("");
  const [label, setLabel] = useState("");
  const [revoking, setRevoking] = useState<{ userId: string; label: string } | null>(null);
  const create = useCreateInvitation({
    mutation: {
      onSuccess: (inv) => { qc.invalidateQueries({ queryKey: getListInvitationsQueryKey() }); setUserId(""); setLabel(""); toast({ title: "Access granted", description: `${inv.label} can now open the report. Share the link with them.` }); },
      onError: (e) => toast({ variant: "destructive", title: "Could not grant access", description: errMsg(e) }),
    },
  });
  const revoke = useRevokeInvitation({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListInvitationsQueryKey() }); setRevoking(null); toast({ title: "Access revoked" }); },
      onError: (e) => toast({ variant: "destructive", title: "Could not revoke", description: errMsg(e) }),
    },
  });
  const link = appUrl();
  const preview = isPreviewHost();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = userId.trim(), l = label.trim();
    if (!id || !l) return;
    create.mutate({ data: { userId: id, label: l } });
  };

  return (
    <div className="ledger-grid min-h-[calc(100dvh-56px)]">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
        <div className="rise">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Administration</div>
          <h1 className="mt-2 font-serif text-4xl">Who can read this report</h1>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.15fr]">
          <div className="space-y-6">
            <ol className="rise space-y-3 rounded-xl border bg-card p-6 text-sm">
              {["Send your colleague the link below and ask them to sign in.", "They will see their account ID. They send it back to you.", "Add their ID here with a label, then tell them to reload."].map((t, i) => (
                <li key={i} className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#10205b] font-mono text-[10px] text-white">{i + 1}</span><span className="text-muted-foreground">{t}</span></li>
              ))}
              <li className="pt-1 text-xs text-muted-foreground">Nothing is emailed from this app; you share the link yourself.</li>
            </ol>
            <div className="rise rounded-xl border bg-card p-6" style={{ animationDelay: "60ms" }}>
              <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-accent" /><h2 className="font-serif text-lg">Share link</h2>
                {preview && <span className="rounded-full border border-[#e0a800]/40 bg-[#e0a800]/10 px-2 py-0.5 text-[10px] font-medium text-[#8a6700]" data-testid="badge-preview">Preview link</span>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/60 px-3 py-2 font-mono text-xs" data-testid="text-share-link">{link}</code>
                <CopyButton value={link} testId="button-copy-link" />
              </div>
              {preview && <p className="mt-2 text-xs text-muted-foreground">This is a development preview address. Publish the app for a stable link to share.</p>}
            </div>
            <form onSubmit={submit} className="rise space-y-4 rounded-xl border bg-card p-6" style={{ animationDelay: "120ms" }}>
              <h2 className="flex items-center gap-2 font-serif text-lg"><UserPlus className="h-4 w-4 text-accent" />Grant access</h2>
              <div className="space-y-1.5"><Label htmlFor="uid">Account ID</Label><Input id="uid" value={userId} maxLength={100} onChange={(e) => setUserId(e.target.value)} placeholder="e.g. 48213907" className="font-mono" data-testid="input-user-id" /></div>
              <div className="space-y-1.5"><Label htmlFor="lbl">Label</Label><Input id="lbl" value={label} maxLength={150} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Priya Raman, Fund Ops" data-testid="input-label" /></div>
              <Button type="submit" className="w-full" disabled={create.isPending || !userId.trim() || !label.trim()} data-testid="button-grant">{create.isPending ? "Granting" : "Grant access"}</Button>
            </form>
          </div>
          <section className="rise rounded-xl border bg-card" style={{ animationDelay: "90ms" }}>
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="font-serif text-lg">Invited readers</h2>
              <span className="font-mono text-xs text-muted-foreground" data-testid="text-invite-count">{list.data?.length ?? 0}</span>
            </div>
            {list.isLoading && <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
            {list.isError && <div className="p-6"><p className="text-sm text-destructive">{errMsg(list.error)}</p><Button size="sm" className="mt-3" onClick={() => list.refetch()} data-testid="button-retry-invites">Retry</Button></div>}
            {list.data && list.data.length === 0 && (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary"><Users className="h-5 w-5 text-secondary-foreground" /></div>
                <p className="mt-4 font-serif text-lg">No colleagues yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">Only you can see the report. Add an account ID to share it.</p>
              </div>
            )}
            {list.data && list.data.length > 0 && (
              <ul className="divide-y">
                {list.data.map((inv) => (
                  <li key={inv.userId} className="flex items-center gap-3 px-6 py-3.5" data-testid={`row-invite-${inv.userId}`}>
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">{inv.label.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{inv.label}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">{inv.userId} · added {fmtDate(inv.createdAt)}</div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setRevoking({ userId: inv.userId, label: inv.label })} data-testid={`button-revoke-${inv.userId}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <AlertDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for {revoking?.label}?</AlertDialogTitle>
            <AlertDialogDescription>They will lose access to the report immediately. You can add them again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); if (revoking) revoke.mutate({ userId: revoking.userId }); }} disabled={revoke.isPending} data-testid="button-confirm-revoke">
              {revoke.isPending ? "Revoking" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
