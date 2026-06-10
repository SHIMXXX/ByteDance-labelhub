import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { RoleMenuItem } from '../router/roleMenus'
import { clearAuthSession } from '../services/api/client'

type AppFrameProps = {
  title: string
  description: string
  menuItems: RoleMenuItem[]
  children: ReactNode
}

function deriveRoleLabel(pathname: string) {
  if (pathname.startsWith('/owner')) {
    return '任务负责人'
  }
  if (pathname.startsWith('/labeler')) {
    return '标注员'
  }
  if (pathname.startsWith('/reviewer')) {
    return '审核员'
  }
  return '工作台'
}

export function AppFrame({ title, description, menuItems, children }: AppFrameProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const roleLabel = deriveRoleLabel(location.pathname)

  function handleLogout() {
    clearAuthSession({ clearExpiredNotice: true })
    navigate('/')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link className="sidebar-home-link" to="/">
            LabelHub
          </Link>
          <span className="sidebar-role-pill">{roleLabel}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          {menuItems.map((item) =>
            item.type === 'group' ? (
              <div className="sidebar-nav-group" key={item.label}>
                <p className="sidebar-nav-group-label">{item.label}</p>
                <div className="sidebar-nav-sublist">
                  {item.items.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={({ isActive }) =>
                        isActive ? 'sidebar-nav-link sidebar-nav-link-nested is-active' : 'sidebar-nav-link sidebar-nav-link-nested'
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'sidebar-nav-link is-active' : 'sidebar-nav-link')}
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-actions">
          <button className="button button-dark" type="button" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </aside>
      <main className="content">
        <div className="content-inner">{children}</div>
      </main>
    </div>
  )
}
