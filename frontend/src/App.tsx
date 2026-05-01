import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { DashboardPage } from '@/pages/dashboard';
import { ApplicationsListPage } from '@/pages/applications/list';
import { ApplicationDetailPage } from '@/pages/applications/detail';
import { SearchSessionsPage } from '@/pages/search-sessions';
import { TemplatesPage } from '@/pages/templates';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/applications" element={<ApplicationsListPage />} />
        <Route path="/applications/:id" element={<ApplicationDetailPage />} />
        <Route path="/search-sessions" element={<SearchSessionsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
