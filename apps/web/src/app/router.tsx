import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useParams, useSearchParams } from 'react-router-dom';
import { Loading, PageSkeleton } from '@/components/States';
import { ADMINS, ALL, APPROVERS, IMPORTERS, SUPERVISORS } from '@/lib/roles';
import type { Role } from '@/types/auth';
import { RequireAuth, RequireRole } from './guards';

const AdminLayout = lazy(() => import('./layout/AdminLayout'));
const Login = lazy(() => import('@/pages/auth/Login'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));

const pages = {
  Desk: lazy(() => import('@/pages/desk/Desk')),
  OpsCenter: lazy(() => import('@/pages/dashboard/OpsCenter')),
  MyWork: lazy(() => import('@/pages/work/MyWork')),
  Wallboard: lazy(() => import('@/pages/wallboard/Wallboard')),
  Accountability: lazy(() => import('@/pages/accountability/Accountability')),
  Frameworks: lazy(() => import('@/pages/frameworks/Frameworks')),
  Targets: lazy(() => import('@/pages/targets/Targets')),
  Dossier: lazy(() => import('@/pages/dossier/Dossier')),
  Proposals: lazy(() => import('@/pages/proposals/Proposals')),
  Approvals: lazy(() => import('@/pages/approvals/Approvals')),
  Reports: lazy(() => import('@/pages/reports/Reports')),
  Datasets: lazy(() => import('@/pages/datasets/Datasets')),
  DatasetDetail: lazy(() => import('@/pages/datasets/DatasetDetail')),
  Documents: lazy(() => import('@/pages/documents/Documents')),
  DocumentReview: lazy(() => import('@/pages/documents/DocumentReview')),
  Imports: lazy(() => import('@/pages/imports/Imports')),
  FeedbackAdmin: lazy(() => import('@/pages/feedback/FeedbackAdmin')),
  PublicStudio: lazy(() => import('@/pages/public-site/PublicStudio')),
  Setup: lazy(() => import('@/pages/system/Setup')),
  Departments: lazy(() => import('@/pages/system/Departments')),
  Users: lazy(() => import('@/pages/system/Users')),
  Settings: lazy(() => import('@/pages/system/Settings')),
  AuditLogs: lazy(() => import('@/pages/system/AuditLogs')),
  BugReports: lazy(() => import('@/pages/system/BugReports')),
  Profile: lazy(() => import('@/pages/system/Profile')),
  PublicHome: lazy(() => import('@/pages/public/PublicHome')),
  FeedbackPublic: lazy(() => import('@/pages/public/FeedbackPublic')),
  PublishedFeedback: lazy(() => import('@/pages/public/PublishedFeedback')),
};

function guarded(Page: LazyExoticComponent<ComponentType>, roles: readonly Role[] = ALL) {
  return (
    <RequireRole roles={roles}>
      <Page />
    </RequireRole>
  );
}

function Standalone() {
  return (
    <Suspense fallback={<Loading tall />}>
      <Outlet />
    </Suspense>
  );
}

/** Hồ sơ chỉ tiêu dựng lại khi đổi chỉ tiêu để không lẫn trạng thái giữa hai hồ sơ. */
function DossierRoute() {
  const { id } = useParams();
  return (
    <RequireRole roles={ALL}>
      <pages.Dossier key={id} />
    </RequireRole>
  );
}

/** Trang chủ khu quản trị là bàn làm việc; liên kết cũ của Trung tâm điều hành (/admin?year=…) chuyển đúng chỗ. */
function HomeRoute() {
  const [params] = useSearchParams();
  if (params.has('year')) return <Navigate to={`/admin/dieu-hanh?${params.toString()}`} replace />;
  return guarded(pages.Desk);
}

const router = createBrowserRouter([
  {
    element: <Standalone />,
    children: [
      { path: '/', element: <pages.PublicHome /> },
      { path: '/phan-anh', element: <pages.FeedbackPublic /> },
      { path: '/phan-anh/cong-khai/:code', element: <pages.PublishedFeedback /> },
      { path: '/admin/login', element: <Login /> },
      { path: '/admin/forgot-password', element: <ForgotPassword /> },
      { path: '/dang-nhap', element: <Navigate to="/admin/login" replace /> },
      {
        path: '/trinh-chieu',
        element: (
          <RequireAuth>
            <pages.Wallboard />
          </RequireAuth>
        ),
      },
    ],
  },
  {
    path: '/admin',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageSkeleton />}>
          <AdminLayout />
        </Suspense>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'dieu-hanh', element: guarded(pages.OpsCenter) },
      { path: 'viec-cua-toi', element: guarded(pages.MyWork) },
      { path: 'trach-nhiem', element: guarded(pages.Accountability, SUPERVISORS) },
      { path: 'bo-chi-tieu', element: guarded(pages.Frameworks) },
      { path: 'targets', element: guarded(pages.Targets) },
      { path: 'targets/:id', element: <DossierRoute /> },
      { path: 'proposals', element: guarded(pages.Proposals) },
      { path: 'approvals', element: guarded(pages.Approvals, APPROVERS) },
      { path: 'reports', element: guarded(pages.Reports) },
      { path: 'kho-du-lieu', element: guarded(pages.Datasets) },
      { path: 'kho-du-lieu/:code', element: guarded(pages.DatasetDetail) },
      { path: 'documents', element: guarded(pages.Documents) },
      { path: 'documents/:id', element: guarded(pages.DocumentReview) },
      { path: 'imports', element: guarded(pages.Imports, IMPORTERS) },
      { path: 'feedback', element: guarded(pages.FeedbackAdmin) },
      { path: 'public-dashboard', element: guarded(pages.PublicStudio, ADMINS) },
      { path: 'thiet-lap', element: guarded(pages.Setup, ADMINS) },
      { path: 'departments', element: guarded(pages.Departments) },
      { path: 'users', element: guarded(pages.Users, ADMINS) },
      { path: 'settings', element: guarded(pages.Settings, ADMINS) },
      { path: 'audit-logs', element: guarded(pages.AuditLogs, ADMINS) },
      { path: 'bao-loi', element: guarded(pages.BugReports, ADMINS) },
      { path: 'profile', element: guarded(pages.Profile) },
      { path: 'copilot', element: <Navigate to="/admin" replace state={{ copilot: true }} /> },
      { path: '*', element: <Navigate to="/admin" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
