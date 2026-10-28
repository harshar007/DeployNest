import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HomeRedirect } from "./pages/HomeRedirect";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { DashboardLayout } from "./pages/DashboardLayout";
import { DashboardOverviewPage } from "./pages/DashboardOverviewPage";
import { RepositoriesPage } from "./pages/RepositoriesPage";
import { RepositoryDetailPage } from "./pages/RepositoryDetailPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { DeploymentDetailPage } from "./pages/DeploymentDetailPage";
import { GitHubIntegrationPage } from "./pages/GitHubIntegrationPage";
import { ServersPage } from "./pages/ServersPage";
import { SettingsPage } from "./pages/SettingsPage";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardOverviewPage />} />
          <Route path="repositories" element={<RepositoriesPage />} />
          <Route path="repositories/:id" element={<RepositoryDetailPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="deployments" element={<DeploymentsPage />} />
          <Route path="deployments/:id" element={<DeploymentDetailPage />} />
          <Route path="github" element={<GitHubIntegrationPage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
