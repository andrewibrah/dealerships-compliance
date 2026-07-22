import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Router, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Summary from "./pages/Summary";
import Wizard from "./pages/Wizard";
import Documents from "./pages/Documents";
import Tasks from "./pages/Tasks";
import Pricing from "./pages/Pricing";
import Profile from "./pages/Profile";

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function AppRouter() {
  return (
    <Router base={base}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/signup"} component={Signup} />
        <Route path={"/login"} component={Login} />
        <Route path={"/dashboard"} component={Dashboard} />
        <Route path={"/summary"} component={Summary} />
        <Route path={"/profile"} component={Profile} />
        <Route path={"/wizard"} component={Wizard} />
        <Route path={"/documents"} component={Documents} />
        <Route path={"/tasks"} component={Tasks} />
        <Route path={"/pricing"} component={Pricing} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

// NOTE: About Theme
// - Dark theme with professional styling for regulatory/compliance product
// - Navy/slate background with gold accents for trust and expertise

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <AppRouter />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
