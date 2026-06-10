import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiPost, clearAuthSession, consumeAuthExpiredNotice, setAuthToken } from '../../services/api/client'
import type { UserRole } from '../../types/domain'

type RoleCard = {
  role: 'Owner' | 'Labeler' | 'Reviewer'
  apiRole: UserRole
  cardTitle: string
  fillLabel: string
  fillHint: string
  description: string
  path: string
  username: string
  password: string
  capability: string
  accent: string
}

type AccountGroup = {
  role: RoleCard['role']
  accent: RoleCard['accent']
  title: string
  summary: string
  accounts: RoleCard[]
}

type LoginResponse = {
  token: string
  user: {
    id: number
    username: string
    displayName: string
    role: UserRole
  }
}

const demoAccounts: RoleCard[] = [
  {
    role: 'Owner',
    apiRole: 'owner',
    cardTitle: 'Owner Demo',
    fillLabel: '填充 Owner 演示账号',
    fillHint: '点击填充账号',
    description: '创建任务、搭建模板、绑定数据集并发起导出。',
    path: '/owner',
    username: 'owner_demo',
    password: 'owner-demo-password',
    capability: '任务管理 · 模板引擎 · 导出中心',
    accent: 'owner',
  },
  {
    role: 'Labeler',
    apiRole: 'labeler',
    cardTitle: 'Labeler Demo',
    fillLabel: '填充 Labeler 演示账号',
    fillHint: '主账号',
    description: '领取任务、连续作答、自动保存并处理打回修改。',
    path: '/labeler',
    username: 'labeler_demo',
    password: 'labeler-demo-password',
    capability: '多题作答 · 自动保存 · 贡献中心',
    accent: 'labeler',
  },
  {
    role: 'Labeler',
    apiRole: 'labeler',
    cardTitle: 'Labeler Demo2',
    fillLabel: '填充 Labeler Demo2 演示账号',
    fillHint: '备用账号',
    description: '领取任务、连续作答、自动保存并处理打回修改。',
    path: '/labeler',
    username: 'labeler_demo2',
    password: 'labeler-demo2-password',
    capability: '多题作答 · 自动保存 · 贡献中心',
    accent: 'labeler',
  },
  {
    role: 'Reviewer',
    apiRole: 'reviewer',
    cardTitle: 'Reviewer Demo',
    fillLabel: '填充 Reviewer 演示账号',
    fillHint: '主账号',
    description: '查看 AI 结论、答案差异与审核时间线，高效完成人审。',
    path: '/reviewer',
    username: 'reviewer_demo',
    password: 'reviewer-demo-password',
    capability: 'AI 预审 · 差异对比 · 多轮审核',
    accent: 'reviewer',
  },
  {
    role: 'Reviewer',
    apiRole: 'reviewer',
    cardTitle: 'Reviewer Demo2',
    fillLabel: '填充 Reviewer Demo2 演示账号',
    fillHint: '备用账号',
    description: '查看 AI 结论、答案差异与审核时间线，高效完成人审。',
    path: '/reviewer',
    username: 'reviewer_demo2',
    password: 'reviewer-demo2-password',
    capability: 'AI 预审 · 差异对比 · 多轮审核',
    accent: 'reviewer',
  },
]

const accountGroups: AccountGroup[] = [
  {
    role: 'Owner',
    accent: 'owner',
    title: 'Owner Demo',
    summary: '任务创建、模板配置与导出入口',
    accounts: [demoAccounts[0]],
  },
  {
    role: 'Labeler',
    accent: 'labeler',
    title: 'Labeler Demo',
    summary: '标注作答、自动保存与贡献跟踪',
    accounts: [demoAccounts[1], demoAccounts[2]],
  },
  {
    role: 'Reviewer',
    accent: 'reviewer',
    title: 'Reviewer Demo',
    summary: '审核流转、差异对比与质量复核',
    accounts: [demoAccounts[3], demoAccounts[4]],
  },
]

const highlights = [
  { label: '拖拽式模板搭建', desc: '组件化物料 · 可视化 Designer · Schema 驱动渲染' },
  { label: 'AI 自动预审 Agent', desc: '可配置评测标准 · Function Calling 结构化输出' },
  { label: '多角色审核流转', desc: '打回 / 通过 / 多级人审 · 完整审计时间线' },
  { label: '多格式异步导出', desc: 'JSONL · CSV · XLSX · ZIP · 字段可映射' },
]

const microHighlights = [
  {
    title: '实时质检',
    variant: 'quality',
    bars: ['84%', '64%', '92%'],
  },
  {
    title: '协同流转',
    variant: 'flow',
    steps: ['O', 'L', 'R'],
  },
  {
    title: '导出队列',
    variant: 'export',
    bars: ['72%', '48%', '88%'],
  },
]

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState(() => window.localStorage.getItem('labelhub_last_username') ?? '')
  const [password, setPassword] = useState('')
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selectedDemoRole = demoAccounts.find((entry) => entry.username === username && entry.password === password)
  const isLoggingIn = pendingRole !== null

  useEffect(() => {
    const expiredNotice = consumeAuthExpiredNotice()
    if (expiredNotice) {
      clearAuthSession({ clearExpiredNotice: true })
      setNotice('登录已失效，请重新登录。')
    }
  }, [])

  function fillDemoAccount(role: RoleCard) {
    setUsername(role.username)
    setPassword(role.password)
    setError('')
    setNotice('')
  }

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码。')
      return
    }

    setPendingRole('owner')
    setError('')
    setNotice('')

    try {
      const result = await apiPost<LoginResponse, { username: string; password: string }>('/auth/login', {
        username: username.trim(),
        password,
      })
      window.localStorage.setItem('labelhub_role', result.user.role)
      window.localStorage.setItem('labelhub_last_username', result.user.username)
      setAuthToken(result.token)

      const matchedRole = demoAccounts.find((entry) => entry.apiRole === result.user.role)
      navigate(matchedRole?.path ?? '/')
    } catch {
      clearAuthSession()
      setError('登录失败，请确认账号密码或后端服务状态。')
    } finally {
      setPendingRole(null)
    }
  }

  return (
    <section className="login-page">
      <header className="login-hero">
        <div className="login-hero-container">
          <div className="login-hero-copy">
            <span className="page-eyebrow">LabelHub · 数据标注平台</span>
            <h1>数据生产、AI 预审与人工审核的全栈闭环</h1>
            <p>
              覆盖模板搭建、标注作答、AI 自动预审、多轮人审流转到多格式导出的全生命周期。
              每个角色都有专属工作台，每条数据都可追溯。
            </p>
            <div className="hero-feature-list">
              {highlights.map((highlight) => (
                <div className="login-feature-chip" key={highlight.label}>
                  <strong>{highlight.label}</strong>
                  <span>{highlight.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="login-hero-visual" aria-hidden="true">
            <div className="visual-stack">
              <div className="login-micro-card-orbit" aria-label="平台亮点">
                {microHighlights.map((item) => (
                  <div className={`login-micro-card login-micro-card-${item.variant}`} key={item.title}>
                    <div className="micro-card-topline">
                      <span>{item.title}</span>
                    </div>
                    {item.steps ? (
                      <div className="micro-flow-track" aria-hidden="true">
                        {item.steps.map((step) => (
                          <span key={step}>{step}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="micro-bars" aria-hidden="true">
                        {item.bars?.map((bar, index) => (
                          <span key={`${item.title}-${bar}`} style={{ width: bar, animationDelay: `${index * 0.32}s` }} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="visual-card visual-card-main">
                <div className="visual-card-header">
                  <div className="mockup-dots"><span></span><span></span><span></span></div>
                  <div className="mockup-title">Reviewer Workbench</div>
                </div>
                <div className="visual-card-body">
                  <div className="diff-preview">
                    <div className="diff-row added"><span>+</span> AI 辅助语义对齐完成</div>
                    <div className="diff-row"><span> </span> 标注员已确认修正</div>
                    <div className="diff-row removed"><span>-</span> 这里的逻辑有误</div>
                  </div>
                  <div className="review-action-preview">
                    <span className="badge-success">通过审核</span>
                    <div className="avatar-stack">
                      <div className="avatar" style={{ background: 'var(--tint-sky)' }}>A</div>
                      <div className="avatar" style={{ background: 'var(--tint-mint)' }}>R</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="visual-card visual-card-sub visual-card-stats">
                <div className="stat-preview">
                  <small>标注进度</small>
                  <strong>92.5%</strong>
                </div>
                <div className="mini-chart">
                  <div className="bar" style={{ width: '92%' }}></div>
                </div>
              </div>

              <div className="visual-card visual-card-sub visual-card-ai">
                <div className="ai-status">
                  <div className="ai-icon">✦</div>
                  <div>
                    <strong>DeepSeek-V3</strong>
                    <small>正在进行 AI 预审...</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="login-workspace-grid flattened">
        <div className="login-cards">
          {accountGroups.map((group) => {
            const selectedAccount = group.accounts.find((entry) => selectedDemoRole?.username === entry.username)

            if (group.accounts.length === 1) {
              const account = group.accounts[0]
              return (
                <button
                  aria-label={account.fillLabel}
                  aria-pressed={selectedDemoRole?.username === account.username}
                  className={`login-card login-card-${account.accent}${selectedDemoRole?.username === account.username ? ' is-selected' : ''}`}
                  key={account.username}
                  type="button"
                  onClick={() => fillDemoAccount(account)}
                  disabled={isLoggingIn}
                >
                  <span className="section-eyebrow">{account.role}</span>
                  <h2>{account.cardTitle}</h2>
                  <p>{account.description}</p>
                  <strong>{account.capability}</strong>
                  <span>{account.fillHint}</span>
                </button>
              )
            }

            return (
              <article
                className={`login-card login-account-group login-card-${group.accent}${selectedAccount ? ' is-selected' : ''}`}
                key={group.role}
              >
                <span className="section-eyebrow">{group.role}</span>
                <h2>{group.title}</h2>
                <p>{group.summary}</p>
                <strong>{selectedAccount?.capability ?? group.accounts[0].capability}</strong>
                <div className="login-account-drawer">
                  {group.accounts.map((account) => (
                    <button
                      aria-label={account.fillLabel}
                      aria-pressed={selectedDemoRole?.username === account.username}
                      className="login-account-option"
                      disabled={isLoggingIn}
                      key={account.username}
                      type="button"
                      onClick={() => fillDemoAccount(account)}
                    >
                      <span>{account.cardTitle}</span>
                      <strong>{account.fillHint}</strong>
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>

        <article className="card login-form-card">
          <div className="login-section-heading">
            <span className="section-eyebrow">演示环境</span>
            <h3>进入系统</h3>
          </div>
          <form
            className="form-grid"
            aria-busy={isLoggingIn}
            onSubmit={(event) => {
              event.preventDefault()
              void handleLogin()
            }}
          >
            <label className="form-field">
              <span>用户名</span>
              <input
                autoComplete="username"
                name="username"
                aria-label="用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>密码</span>
              <input
                autoComplete="current-password"
                name="password"
                aria-label="密码"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="button-row login-submit-row">
              <button className="button-primary" type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? '登录中...' : selectedDemoRole ? `进入 ${selectedDemoRole.role} 工作台` : '登录'}
              </button>
            </div>
          </form>
          {notice ? <p className="feedback-message">{notice}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </article>
      </div>
    </section>
  )
}
