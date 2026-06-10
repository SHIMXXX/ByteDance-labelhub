import type { UserRole } from '../types/domain'

export type RoleMenuItem =
  | {
      type: 'link'
      label: string
      to: string
    }
  | {
      type: 'group'
      label: string
      items: Array<{
        label: string
        to: string
      }>
    }

export const roleHomePath: Record<UserRole, string> = {
  owner: '/owner/dashboard',
  labeler: '/labeler/dashboard',
  reviewer: '/reviewer/dashboard',
}

export const roleMenus: Record<UserRole, RoleMenuItem[]> = {
  owner: [
    { type: 'link', label: '主页', to: '/owner/dashboard' },
    {
      type: 'group',
      label: '标注管理',
      items: [
        { label: '任务管理', to: '/owner/tasks' },
        { label: '数据集管理', to: '/owner/datasets' },
        { label: '模板库管理', to: '/owner/templates' },
        { label: '导出管理', to: '/owner/exports' },
      ],
    },
    {
      type: 'group',
      label: '质量监控',
      items: [
        { label: '审核管理', to: '/owner/reviews' },
      ],
    },
  ],
  labeler: [
    { type: 'link', label: '主页', to: '/labeler/dashboard' },
    {
      type: 'group',
      label: '任务管理',
      items: [
        { label: '任务广场', to: '/labeler/plaza' },
        { label: '我的任务', to: '/labeler/tasks' },
        { label: '我的贡献', to: '/labeler/contributions' },
      ],
    },
  ],
  reviewer: [
    { type: 'link', label: '主页', to: '/reviewer/dashboard' },
    { type: 'link', label: '审核台', to: '/reviewer/reviews' },
    { type: 'link', label: '质检统计', to: '/reviewer/quality-stats' },
  ],
}
