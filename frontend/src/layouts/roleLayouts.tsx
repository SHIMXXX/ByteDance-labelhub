import { Navigate, Outlet } from 'react-router-dom'
import { AppFrame } from './AppFrame'
import { roleMenus } from '../router/roleMenus'

export function OwnerLayout() {
  return (
    <AppFrame title="Owner 工作台" description="管理任务、模板、数据与导出" menuItems={roleMenus.owner}>
      <Outlet />
    </AppFrame>
  )
}

export function OwnerHomeRedirect() {
  return <Navigate to="/owner/dashboard" replace />
}

export function LabelerLayout() {
  return (
    <AppFrame title="Labeler 工作台" description="领取任务、连续作答并跟踪个人进度" menuItems={roleMenus.labeler}>
      <Outlet />
    </AppFrame>
  )
}

export function LabelerHomeRedirect() {
  return <Navigate to="/labeler/dashboard" replace />
}

export function ReviewerLayout() {
  return (
    <AppFrame title="Reviewer 工作台" description="高效处理待审结果并追踪审核质量" menuItems={roleMenus.reviewer}>
      <Outlet />
    </AppFrame>
  )
}

export function ReviewerHomeRedirect() {
  return <Navigate to="/reviewer/dashboard" replace />
}
