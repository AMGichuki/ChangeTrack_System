import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './context/useAuth'
import { ROLE_HOME } from './config/roles'
import ProtectedRoute from './components/ProtectedRoute'
import StaffLayout from './components/StaffLayout'
import StudentLayout from './components/StudentLayout'
import SignInPage from './pages/SignInPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PlaceholderPage from './pages/PlaceholderPage'
import ManageUsersPage from './pages/admin/ManageUsersPage'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminRequestPage from './pages/admin/AdminRequestPage'
import ControlsPage from './pages/admin/ControlsPage'
import StructurePage from './pages/admin/StructurePage'
import MyRequestsPage from './pages/lecturer/MyRequestsPage'
import NewRequestPage from './pages/lecturer/NewRequestPage'
import EditRequestPage from './pages/lecturer/EditRequestPage'
import LecturerRequestPage from './pages/lecturer/LecturerRequestPage'
import ReviewQueuePage from './pages/review/ReviewQueuePage'
import ReviewHistoryPage from './pages/review/ReviewHistoryPage'
import StudentTrackerPage from './pages/student/StudentTrackerPage'
import { ThemeProvider } from './context/ThemeProvider'

// Every staff screen from the wireframes. Pages with a "page" are built;
// the rest show a placeholder until the sprint that builds them.
const STAFF_PAGES = [
  { path: '/lecturer', role: 'LECTURER', title: 'My requests', page: MyRequestsPage },
  { path: '/lecturer/new', role: 'LECTURER', title: 'New grade change request', page: NewRequestPage },
  { path: '/lecturer/requests/:id', role: 'LECTURER', title: 'Request', page: LecturerRequestPage },
  { path: '/lecturer/requests/:id/edit', role: 'LECTURER', title: 'Correct returned request', page: EditRequestPage },
  { path: '/chair', role: 'CHAIR', title: 'Review grade change requests', page: ReviewQueuePage },
  { path: '/chair/history', role: 'CHAIR', title: 'Request history', page: ReviewHistoryPage },
  { path: '/dean', role: 'DEAN', title: 'Review grade change requests', page: ReviewQueuePage },
  { path: '/dean/history', role: 'DEAN', title: 'Request history', page: ReviewHistoryPage },
  { path: '/registrar', role: 'REGISTRAR', title: 'Verify & post grade changes', page: ReviewQueuePage },
  { path: '/registrar/history', role: 'REGISTRAR', title: 'Request history', page: ReviewHistoryPage },
  { path: '/admin', role: 'ADMIN', title: 'System overview', page: AdminOverviewPage },
  { path: '/admin/requests/:id', role: 'ADMIN', title: 'Request', page: AdminRequestPage },
  { path: '/admin/users', role: 'ADMIN', title: 'Manage users', page: ManageUsersPage },
  { path: '/admin/structure', role: 'ADMIN', title: 'Departments & roles', page: StructurePage },
  { path: '/admin/controls', role: 'ADMIN', title: 'Controls & audit', page: ControlsPage },
]

// "/" sends each person to their own home screen.
function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <p className="loading">Loading…</p>
  return <Navigate to={user ? ROLE_HOME[user.role] : '/signin'} replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<HomeRedirect />} />

            {/* Staff screens: each page only opens for its own role */}
            {STAFF_PAGES.map((page) => (
              <Route key={page.path} element={<ProtectedRoute roles={[page.role]} />}>
                <Route element={<StaffLayout />}>
                  <Route path={page.path} element={page.page ? <page.page /> : <PlaceholderPage {...page} />} />
                </Route>
              </Route>
            ))}

            {/* Acting approver: any staff member the Admin has set to act for a Chair, Dean or Registrar today */}
            <Route element={<ProtectedRoute roles={['CHAIR', 'DEAN', 'REGISTRAR']} allowActing />}>
              <Route element={<StaffLayout />}>
                <Route path="/acting/:approverId" element={<ReviewQueuePage />} />
              </Route>
            </Route>

            {/* Student screen */}
            <Route element={<ProtectedRoute roles={['STUDENT']} />}>
              <Route element={<StudentLayout />}>
                <Route path="/student" element={<StudentTrackerPage />} />
              </Route>
            </Route>

            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
