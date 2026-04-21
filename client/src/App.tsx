import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Landing from "./pages/Landing";
import Home from "./pages/Home";
import PurchaseOrders from "./pages/PurchaseOrders";
import CostInvoices from "./pages/CostInvoices";

/**
 * Compras y Personal routes.
 *
 *   /                         → Landing (tiles grid)
 *   /purchase-orders          → Órdenes de Compra (Phase 1d port; placeholder→brewery link for now)
 *   /cost-invoices            → Fletes y Gastos (same)
 *   /servicios-profesionales  → existing invoice/lote flow (Home.tsx)
 *   /personal                 → existing personal-eventual flow (Home.tsx)
 *
 * Home.tsx is used for both /servicios-profesionales and /personal because
 * it's already a tab-based page handling both concerns. Splitting is a
 * Phase 1b follow-up.
 */
function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/purchase-orders" component={PurchaseOrders} />
      <Route path="/cost-invoices" component={CostInvoices} />
      <Route path="/servicios-profesionales" component={Home} />
      <Route path="/personal" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          <DashboardLayout>
            <Router />
          </DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
