import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { getGetDashboardAccessQueryKey, useGetDashboardAccess } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ReportPage from "@/pages/report";
import DataPage from "@/pages/data";
import AccessPage from "@/pages/access";
import { Shell } from "@/components/shell";
import { AccessErrorGate, GateLoading, LoginGate, UnauthorizedGate } from "@/components/gate";
import { errMsg } from "@/lib/format";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Gate() {
  const { isLoading, isAuthenticated } = useAuth();
  const access = useGetDashboardAccess({ query: { queryKey: getGetDashboardAccessQueryKey(), enabled: isAuthenticated } });
  if (isLoading) return <GateLoading />;
  if (!isAuthenticated) return <LoginGate />;
  if (access.isLoading) return <GateLoading />;
  if (access.isError || !access.data) return <AccessErrorGate message={errMsg(access.error)} onRetry={() => access.refetch()} />;
  const a = access.data;
  if (!a.authorized) return <UnauthorizedGate adminConfigured={a.adminConfigured} />;
  return (
    <Shell isAdmin={a.isAdmin}>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/">{() => <ReportPage isAdmin={a.isAdmin} />}</Route>
          <Route path="/data" component={DataPage} />
          <Route path="/access">{() => (a.isAdmin ? <AccessPage /> : <NotFound />)}</Route>
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Gate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
