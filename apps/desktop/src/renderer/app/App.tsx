import { useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useUiStore } from './store';
import { AppShell } from '../widgets/AppShell';
import { WelcomePage } from '../pages/WelcomePage';
import { DashboardPage } from '../pages/DashboardPage';
import { PreferencesPage } from '../pages/PreferencesPage';
import { HistoryPage } from '../pages/HistoryPage';
import { PrivacyPage } from '../pages/PrivacyPage';
import { EurydicePage } from '../features/eurydice/EurydicePage';
import { OrpheusPage } from '../features/orpheus/OrpheusPage';
import { IdentityDraftsPage } from '../features/orpheus/IdentityDraftsPage';
import { AudienceDraftsPage } from '../features/orpheus/AudienceDraftsPage';

function BootstrapGate({ children }: { children: ReactNode }) {
  const consentAccepted = useUiStore((s) => s.consentAccepted);
  const hydrated = useUiStore((s) => s.hydrated);
  const hydrate = useUiStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="boot-screen">
        <p>Загрузка Orpheus &amp; Eurydice…</p>
      </div>
    );
  }

  if (!consentAccepted) {
    return <WelcomePage />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <HashRouter>
      <BootstrapGate>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/eurydice" replace />} />
            <Route path="/settings" element={<DashboardPage />} />
            <Route path="/dashboard" element={<Navigate to="/settings" replace />} />
            <Route path="/setup" element={<Navigate to="/settings" replace />} />
            <Route path="/ai" element={<Navigate to="/settings" replace />} />
            <Route path="/device" element={<Navigate to="/settings" replace />} />
            <Route path="/preferences" element={<PreferencesPage />} />
            <Route path="/references" element={<Navigate to="/preferences" replace />} />
            <Route path="/eurydice" element={<EurydicePage />} />
            <Route path="/session" element={<Navigate to="/eurydice" replace />} />
            <Route path="/orpheus" element={<OrpheusPage />} />
            <Route path="/orpheus/identity-drafts" element={<IdentityDraftsPage />} />
            <Route path="/orpheus/audience-drafts" element={<AudienceDraftsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/eurydice" replace />} />
        </Routes>
      </BootstrapGate>
    </HashRouter>
  );
}
