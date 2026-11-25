import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { authEnabled, getAccessToken } from "./lib/auth";
import { AuthCallbackPage, LoginPage, LogoutCallbackPage } from "./pages/AuthPage";
import { projectStoryOverviewPath } from "./lib/routes";
import { ProjectLibraryPage } from "./pages/ProjectLibraryPage";
import { ProjectStoryPage } from "./pages/ProjectStoryPage";
import { NotFoundPage, ProjectsPage } from "./pages/ProjectsPage";
import { PracticeReferencePlayerProvider } from "./components/practice/PracticeReferencePlayer";

const DirectorKnowledgePage = lazy(() => import("./pages/DirectorKnowledgePage").then((module) => ({ default: module.DirectorKnowledgePage })));
const WeeklyRadarListPage = lazy(() => import("./pages/WeeklyRadarPage").then((module) => ({ default: module.WeeklyRadarListPage })));
const WeeklyRadarDetailPage = lazy(() => import("./pages/WeeklyRadarPage").then((module) => ({ default: module.WeeklyRadarDetailPage })));

const VideoPracticeListPage = lazy(() => import("./pages/VideoPracticePage").then((module) => ({ default: module.VideoPracticeListPage })));
const VideoPracticeDetailPage = lazy(() => import("./pages/VideoPracticePage").then((module) => ({ default: module.VideoPracticeDetailPage })));

function ProjectRedirect() {
  const { projectId = "" } = useParams();
  return <Navigate to={projectStoryOverviewPath(projectId)} replace />;
}

function AuthGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(authEnabled);

  useEffect(() => {
    if (!authEnabled) return;
    const token = getAccessToken();
    if (!token) {
      window.location.replace(`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    setChecking(false);
  }, [location.pathname, location.search]);

  if (checking) return <div className="route-error-page"><p>正在检查登录状态…</p></div>;
  return <>{children}</>;
}

export default function App() {
  return (
    <PracticeReferencePlayerProvider><Routes>
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/callback/guli" element={<AuthCallbackPage />} />
      <Route path="/auth/logout-callback" element={<LogoutCallbackPage />} />
      <Route element={<AuthGuard><Outlet /></AuthGuard>}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/knowledge/*" element={<Suspense fallback={<div className="route-error-page"><p>正在打开导演知识库…</p></div>}><DirectorKnowledgePage /></Suspense>} />
        <Route path="/ai-video-practice" element={<Suspense fallback={<div className="route-error-page"><p>正在打开 AI 视频练习室…</p></div>}><VideoPracticeListPage /></Suspense>} />
        <Route path="/ai-video-practice/:exerciseId" element={<Suspense fallback={<div className="route-error-page"><p>正在打开练习详情…</p></div>}><VideoPracticeDetailPage /></Suspense>} />
        <Route path="/ai-video-radar" element={<Suspense fallback={<div className="route-error-page"><p>正在打开 AI 视频一周雷达…</p></div>}><WeeklyRadarListPage /></Suspense>} />
        <Route path="/ai-video-radar/reports/:reportId" element={<Suspense fallback={<div className="route-error-page"><p>正在打开 AI 视频一周雷达…</p></div>}><WeeklyRadarDetailPage /></Suspense>} />
        <Route path="/projects/:projectId" element={<ProjectRedirect />} />
        <Route path="/projects/:projectId/story" element={<ProjectStoryPage />} />
        <Route path="/projects/:projectId/story/characters/:characterId" element={<ProjectStoryPage />} />
        <Route path="/projects/:projectId/story/locations/:locationId" element={<ProjectStoryPage />} />
        <Route path="/projects/:projectId/story/episodes/:episodeId" element={<ProjectStoryPage />} />
        <Route path="/projects/:projectId/story/episodes/:episodeId/scenes/:sceneId" element={<ProjectStoryPage />} />
        <Route path="/projects/:projectId/library/*" element={<ProjectLibraryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></PracticeReferencePlayerProvider>
  );
}
