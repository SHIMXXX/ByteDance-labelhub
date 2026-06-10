import { Navigate, Route, Routes } from 'react-router-dom'
import { OwnerTasksPage } from './pages/owner/tasks/OwnerTasksPage'
import { OwnerTemplatesPage } from './pages/owner/templates/OwnerTemplatesPage'
import { LabelerPlazaPage } from './pages/labeler/plaza/LabelerPlazaPage'
import { LabelerWorkbenchPage } from './pages/labeler/workbench/LabelerWorkbenchPage'
import { MyContributionPage } from './pages/labeler/MyContributionPage'
import { ReviewerReviewsPage } from './pages/reviewer/reviews/ReviewerReviewsPage'
import { OwnerExportsPage } from './pages/owner/exports/OwnerExportsPage'
import { LoginPage } from './pages/auth/LoginPage'
import { RoleGuard } from './router/guards'
import {
  LabelerHomeRedirect,
  LabelerLayout,
  OwnerHomeRedirect,
  OwnerLayout,
  ReviewerHomeRedirect,
  ReviewerLayout,
} from './layouts/roleLayouts'
import { OwnerDashboardPage } from './pages/owner/dashboard/OwnerDashboardPage'
import { LabelerDashboardPage } from './pages/labeler/dashboard/LabelerDashboardPage'
import { ReviewerDashboardPage } from './pages/reviewer/dashboard/ReviewerDashboardPage'
import { OwnerTaskDetailPage } from './pages/owner/tasks/OwnerTaskDetailPage'
import { OwnerTaskAnalyticsPage } from './pages/owner/tasks/OwnerTaskAnalyticsPage'
import { OwnerDatasetsPage } from './pages/owner/datasets/OwnerDatasetsPage'
import { OwnerDatasetsImportPage } from './pages/owner/datasets/OwnerDatasetsImportPage'
import { OwnerDatasetDetailPage } from './pages/owner/datasets/OwnerDatasetDetailPage'
import { OwnerTemplateDesignerPage } from './pages/owner/templates/OwnerTemplateDesignerPage'
import { OwnerReviewManagementPage } from './pages/owner/reviews/OwnerReviewManagementPage'
import { ReviewerQualityStatsPage } from './pages/reviewer/ReviewerQualityStatsPage'
import { LabelerMyTasksPage } from './pages/labeler/LabelerMyTasksPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route
        path="/labeler/workbench"
        element={
          <RoleGuard role="labeler">
            <LabelerWorkbenchPage />
          </RoleGuard>
        }
      />

      <Route
        path="/owner"
        element={
          <RoleGuard role="owner">
            <OwnerLayout />
          </RoleGuard>
        }
      >
        <Route index element={<OwnerHomeRedirect />} />
        <Route path="dashboard" element={<OwnerDashboardPage />} />
        <Route path="tasks" element={<OwnerTasksPage />} />
        <Route path="tasks/:taskId" element={<OwnerTaskDetailPage />} />
        <Route path="tasks/:taskId/analytics" element={<OwnerTaskAnalyticsPage />} />
        <Route path="templates" element={<OwnerTemplatesPage />} />
        <Route path="datasets" element={<OwnerDatasetsPage />} />
        <Route path="datasets/import" element={<OwnerDatasetsImportPage />} />
        <Route path="datasets/:datasetId" element={<OwnerDatasetDetailPage />} />
        <Route path="exports" element={<OwnerExportsPage />} />
        <Route path="reviews" element={<OwnerReviewManagementPage />} />
      </Route>

      <Route
        path="/owner/templates/:templateId/designer"
        element={
          <RoleGuard role="owner">
            <OwnerTemplateDesignerPage />
          </RoleGuard>
        }
      />

      <Route
        path="/labeler"
        element={
          <RoleGuard role="labeler">
            <LabelerLayout />
          </RoleGuard>
        }
      >
        <Route index element={<LabelerHomeRedirect />} />
        <Route path="dashboard" element={<LabelerDashboardPage />} />
        <Route path="plaza" element={<LabelerPlazaPage />} />
        <Route path="tasks" element={<LabelerMyTasksPage />} />
        <Route path="contributions" element={<MyContributionPage />} />
      </Route>

      <Route
        path="/reviewer"
        element={
          <RoleGuard role="reviewer">
            <ReviewerLayout />
          </RoleGuard>
        }
      >
        <Route index element={<ReviewerHomeRedirect />} />
        <Route path="dashboard" element={<ReviewerDashboardPage />} />
        <Route path="reviews" element={<ReviewerReviewsPage />} />
        <Route path="quality-stats" element={<ReviewerQualityStatsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
