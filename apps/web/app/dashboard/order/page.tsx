'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Shield } from 'lucide-react'
import { Turnstile } from '@marsidev/react-turnstile'

const WINDOWS_VERSIONS_FALLBACK = [
  // Desktop - Custom/Optimized
  { id: 'win_11revi_h25', name: 'Windows 11 ReviOS H2 2025', category: 'desktop' },
  { id: 'win_11atlas_h25', name: 'Windows 11 AtlasOS H2 2025', category: 'desktop' },
  { id: 'win_11atlas_h22', name: 'Windows 11 AtlasOS H2 2022', category: 'desktop' },
  { id: 'win_11ghost', name: 'Windows 11 Ghost Spectre', category: 'desktop' },
  { id: 'win_10atlas', name: 'Windows 10 AtlasOS', category: 'desktop' },
  { id: 'win_10ghost', name: 'Windows 10 Ghost Spectre', category: 'desktop' },
  // Desktop - Standard
  { id: 'win_11_pro', name: 'Windows 11 Pro', category: 'desktop' },
  { id: 'win_10_ent', name: 'Windows 10 Enterprise', category: 'desktop' },
  { id: 'win_7', name: 'Windows 7', category: 'desktop' },
  // UEFI
  { id: 'win_11_uefi', name: 'Windows 11 UEFI', category: 'uefi' },
  { id: 'win_10_uefi', name: 'Windows 10 UEFI', category: 'uefi' },
  { id: 'win_2022_uefi', name: 'Windows Server 2022 UEFI', category: 'uefi' },
  { id: 'win_2019_uefi', name: 'Windows Server 2019 UEFI', category: 'uefi' },
  { id: 'win_2016_uefi', name: 'Windows Server 2016 UEFI', category: 'uefi' },
  { id: 'win_2012R2_uefi', name: 'Windows Server 2012 R2 UEFI', category: 'uefi' },
  // Server - Standard
  { id: 'win_2025', name: 'Windows Server 2025', category: 'server' },
  { id: 'win_22', name: 'Windows Server 2022', category: 'server' },
  { id: 'win_19', name: 'Windows Server 2019', category: 'server' },
  { id: 'win_2016', name: 'Windows Server 2016', category: 'server' },
  { id: 'win_2012R2', name: 'Windows Server 2012 R2', category: 'server' },
  { id: 'win_2008', name: 'Windows Server 2008', category: 'server' },
  // Lite
  { id: 'win_7_sp1_lite', name: 'Windows 7 SP1 Lite', category: 'lite' },
  { id: 'win_2022_lite', name: 'Windows Server 2022 Lite', category: 'lite' },
  { id: 'win_2016_lite', name: 'Windows Server 2016 Lite', category: 'lite' },
  { id: 'win_2012R2_lite', name: 'Windows Server 2012 R2 Lite', category: 'lite' },
] as const

// Docker OS versions — separate list from dedicated (uses dockur/windows via rdp.sh)
const DOCKER_OS_VERSIONS = [
  // Desktop
  { id: 'docker_win11_pro', name: 'Windows 11 Pro', category: 'docker_desktop' },
  { id: 'docker_win11_ltsc', name: 'Windows 11 LTSC', category: 'docker_desktop' },
  { id: 'docker_win11_ent', name: 'Windows 11 Enterprise', category: 'docker_desktop' },
  { id: 'docker_win10_pro', name: 'Windows 10 Pro', category: 'docker_desktop' },
  { id: 'docker_win10_ltsc', name: 'Windows 10 LTSC', category: 'docker_desktop' },
  { id: 'docker_win10_ent', name: 'Windows 10 Enterprise', category: 'docker_desktop' },
  { id: 'docker_win81_ent', name: 'Windows 8.1 Enterprise', category: 'docker_desktop' },
  { id: 'docker_win7', name: 'Windows 7 Ultimate', category: 'docker_desktop' },
  { id: 'docker_vista', name: 'Windows Vista Ultimate', category: 'docker_desktop' },
  { id: 'docker_xp', name: 'Windows XP Professional', category: 'docker_desktop' },
  { id: 'docker_2000', name: 'Windows 2000 Professional', category: 'docker_desktop' },
  // Server
  { id: 'docker_srv2025', name: 'Windows Server 2025', category: 'docker_server' },
  { id: 'docker_srv2022', name: 'Windows Server 2022', category: 'docker_server' },
  { id: 'docker_srv2019', name: 'Windows Server 2019', category: 'docker_server' },
  { id: 'docker_srv2016', name: 'Windows Server 2016', category: 'docker_server' },
  { id: 'docker_srv2012', name: 'Windows Server 2012', category: 'docker_server' },
  { id: 'docker_srv2008', name: 'Windows Server 2008', category: 'docker_server' },
  { id: 'docker_srv2003', name: 'Windows Server 2003', category: 'docker_server' },
  // Lightweight / Custom
  { id: 'docker_tiny11', name: 'Tiny11 (Lightweight Win11)', category: 'docker_lite' },
]

const CATEGORY_LABELS: Record<string, string> = {
  windows11: 'Windows 11',
  windows10: 'Windows 10',
  server: 'Server',
  lite: 'Lite',
  uefi: 'UEFI',
  legacy: 'Legacy',
    docker_desktop: 'Desktop',
    docker_server: 'Server',
    docker_lite: 'Lightweight / Custom',
}

const CATEGORY_ORDER = ['windows11', 'windows10', 'server', 'lite', 'uefi', 'legacy'] as const
const DOCKER_CATEGORY_ORDER = ['docker_desktop', 'docker_server', 'docker_lite'] as const

interface VpsSpecs {
  memoryMB: number
  memoryGB: number
  diskGB: number
  cpuCores: number
  kvmSupported: boolean
  hostname: string
  os: string
  meetsRequirements: boolean
}

function getGroupedVersions(versions: {id: string, name: string, category: string}[]) {
  const groups: Record<string, {id: string, name: string, category: string}[]> = {}
  for (const version of versions) {
    if (!groups[version.category]) {
      groups[version.category] = []
    }
    groups[version.category].push(version)
  }
  return groups
}

export default function OrderPage() {
  const [formData, setFormData] = useState({
    vpsIp: '',
    rootPassword: '',
    windowsVersion: '',
    rdpPassword: '',
    rdpType: 'dedicated' as 'dedicated' | 'docker',
  })
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ installationId: string } | null>(null)
  const [versions, setVersions] = useState<{id: string, name: string, category: string}[]>([])
  const [step, setStep] = useState<'form' | 'checking' | 'specs' | 'error'>('form')
  const [specs, setSpecs] = useState<VpsSpecs | null>(null)
  const [checkError, setCheckError] = useState('')
  const [failCount, setFailCount] = useState(0)
  const [frozen, setFrozen] = useState(false)
  const [installPrice, setInstallPrice] = useState(1000)
  const [balance, setBalance] = useState<number | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    fetch('/api/public/settings').then(r => r.json()).then(d => {
      const p = d.data?.install_price
      setInstallPrice(typeof p === 'object' ? (p.amount || 1000) : (parseInt(p) || 1000))
    }).catch(() => {})
    // Fetch user balance
    fetch('/api/profile').then(r => r.json()).then(d => {
      setBalance(d.data?.credit_balance ?? 0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/public/os-versions')
      .then(r => r.json())
      .then(d => {
        const enabled = (d.data || []).filter((v: any) => v.enabled !== false)
        setVersions(enabled.length > 0 ? enabled : [...WINDOWS_VERSIONS_FALLBACK])
      })
      .catch(() => {
        setVersions([...WINDOWS_VERSIONS_FALLBACK])
      })
  }, [])

  const groupedVersions = getGroupedVersions(versions)

  const handleCheckVPS = async () => {
    if (!formData.vpsIp || !formData.rootPassword) {
      setError('VPS IP and Root Password are required')
      return
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(formData.vpsIp)) {
      setError('Invalid IP address format')
      return
    }

    setError(null)
    setCheckError('')
    setStep('checking')
    setChecking(true)

    try {
      const res = await fetch('/api/orders/check-vps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vps_ip: formData.vpsIp,
          root_password: formData.rootPassword,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setSpecs(data.specs)
        setStep('specs')
        setFailCount(0)
      } else {
        setCheckError(data.error)
        setSpecs(data.specs || null)
        setFailCount(data.fail_count || 0)
        setFrozen(data.frozen || false)
        setStep('error')
      }
    } catch {
      setCheckError('Network error - could not reach server')
      setStep('error')
    } finally {
      setChecking(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validation
    if (!formData.vpsIp || !formData.rootPassword || !formData.windowsVersion || !formData.rdpPassword) {
      setError('All fields are required')
      return
    }

    if (formData.rdpPassword.length < 6) {
      setError('RDP password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      // Check maintenance before proceeding
      const mRes = await fetch('/api/maintenance')
      const mData = await mRes.json()
      if (mData.data?.enabled) {
        const scope = Array.isArray(mData.data.scope) ? mData.data.scope : [mData.data.scope]
        if (scope.includes('install') || scope.includes('all')) {
          setError('Installation is currently under maintenance')
          setLoading(false)
          return
        }
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vps_ip: formData.vpsIp,
          root_password: formData.rootPassword,
          windows_version: formData.windowsVersion,
          rdp_password: formData.rdpPassword,
          rdp_type: formData.rdpType,
          turnstileToken,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start installation')
      }

      setSuccess({ installationId: data.installationId || data.data?.installation_id || data.id })
      setFormData({
        vpsIp: '',
        rootPassword: '',
        windowsVersion: '',
        rdpPassword: '',
        rdpType: 'dedicated',
      })
      setStep('form')
      setSpecs(null)
      setTurnstileToken('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start installation')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Reset spec check when VPS details change
    if (field === 'vpsIp' || field === 'rootPassword') {
      if (step === 'specs' || step === 'error') {
        setStep('form')
        setSpecs(null)
        setCheckError('')
      }
    }
  }

  const handleBackToForm = () => {
    setStep('form')
    setSpecs(null)
    setCheckError('')
  }

  // Success state
  if (success) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Install RDP</h1>
          <p className="text-gray-500 text-sm mt-1">Install Windows RDP on your VPS</p>
        </div>

        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 text-center">
          <div className="size-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="size-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mt-3">Installation Started!</h3>
          <p className="text-gray-400 text-sm mt-1">Your RDP installation has been queued.</p>
          <p className="text-gray-500 text-xs mt-2">Installation ID: <span className="text-gray-300 font-mono">{success.installationId}</span></p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link href="/dashboard/installations" className="inline-block text-blue-400 hover:text-blue-300 text-sm transition-colors">
              View Installation Progress →
            </Link>
            <button
              onClick={() => setSuccess(null)}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Install Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Install RDP</h1>
        <p className="text-gray-500 text-sm mt-1">Install Windows RDP on your VPS</p>
      </div>

      {/* Minimum Specifications */}
      <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--surface-2, #1a1a1f)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
        <div className="text-xs font-medium text-white mb-3">Minimum Specifications</div>
        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-muted, #8a8b9e)' }}>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-400" />RAM: 1 GB
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-400" />Storage: 20 GB
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-400" />CPU: 1 Core
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-400" />KVM: Required
          </div>
        </div>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit}>
        <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-6 space-y-5">
          {/* VPS IP */}
          <div>
            <label htmlFor="vpsIp" className="block text-sm font-medium text-gray-300 mb-1.5">VPS IP Address</label>
            <input
              id="vpsIp"
              type="text"
              placeholder="192.168.1.1"
              value={formData.vpsIp}
              onChange={(e) => handleInputChange('vpsIp', e.target.value)}
              disabled={loading || checking}
              className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 outline-none transition-all disabled:opacity-50"
            />
          </div>

          {/* Root Password */}
          <div>
            <label htmlFor="rootPassword" className="block text-sm font-medium text-gray-300 mb-1.5">Root Password</label>
            <input
              id="rootPassword"
              type="password"
              placeholder="Your VPS root password"
              value={formData.rootPassword}
              onChange={(e) => handleInputChange('rootPassword', e.target.value)}
              disabled={loading || checking}
              className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 outline-none transition-all disabled:opacity-50"
            />
          </div>

          {/* Check VPS Button (Step 1) */}
          {step === 'form' && (
            <button
              type="button"
              onClick={handleCheckVPS}
              disabled={checking || !formData.vpsIp || !formData.rootPassword || (balance !== null && balance < installPrice)}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium py-2.5 rounded-lg transition-all duration-150 flex items-center justify-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed"
            >
              {checking ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Checking VPS...
                </>
              ) : balance !== null && balance < installPrice ? (
                `Insufficient balance (need Rp ${installPrice.toLocaleString('id-ID')})`
              ) : (
                <>
                  <Shield className="size-4" />
                  Check VPS Specs
                </>
              )}
            </button>
          )}

          {/* Checking state */}
          {step === 'checking' && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-400 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Connecting to VPS and checking specifications...
            </div>
          )}

          {/* Specs Summary (Step 2 - Success) */}
          {step === 'specs' && specs && (
            <>
              <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <div className="text-xs font-medium text-emerald-400 mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  VPS Specifications Verified
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Hostname:</span> <span className="text-white">{specs.hostname}</span></div>
                  <div><span className="text-gray-500">OS:</span> <span className="text-white">{specs.os}</span></div>
                  <div><span className="text-gray-500">RAM:</span> <span className="text-white">{specs.memoryGB}GB</span></div>
                  <div><span className="text-gray-500">Disk:</span> <span className="text-white">{specs.diskGB}GB</span></div>
                  <div><span className="text-gray-500">CPU:</span> <span className="text-white">{specs.cpuCores} Core(s)</span></div>
                  <div><span className="text-gray-500">KVM:</span> <span className="text-emerald-400">Supported</span></div>
                </div>
              </div>

              {/* RDP Type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Installation Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { handleInputChange('rdpType', 'dedicated'); handleInputChange('windowsVersion', '') }}
                    disabled={loading}
                    className={`relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 text-left disabled:opacity-50 ${
                      formData.rdpType === 'dedicated'
                        ? 'ring-2 ring-blue-500/60 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    style={{
                      background: formData.rdpType === 'dedicated' ? 'rgba(59,130,246,0.08)' : 'var(--surface-2, #1a1a1f)',
                      border: `1px solid ${formData.rdpType === 'dedicated' ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle, rgba(255,255,255,0.06))'}`,
                    }}
                  >
                    <div className="font-medium">Dedicated</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted, #55566a)' }}>Full OS reinstall via binary image</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleInputChange('rdpType', 'docker'); handleInputChange('windowsVersion', '') }}
                    disabled={loading}
                    className={`relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 text-left disabled:opacity-50 ${
                      formData.rdpType === 'docker'
                        ? 'ring-2 ring-blue-500/60 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    style={{
                      background: formData.rdpType === 'docker' ? 'rgba(59,130,246,0.08)' : 'var(--surface-2, #1a1a1f)',
                      border: `1px solid ${formData.rdpType === 'docker' ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle, rgba(255,255,255,0.06))'}`,
                    }}
                  >
                    <div className="font-medium">Docker</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted, #55566a)' }}>Windows via Docker container (QEMU/KVM)</div>
                  </button>
                </div>
              </div>

              {/* Windows Version - only shown after specs pass */}
              <div>
                <label htmlFor="windowsVersion" className="block text-sm font-medium text-gray-300 mb-1.5">Windows Version</label>
                <select
                  id="windowsVersion"
                  value={formData.windowsVersion}
                  onChange={(e) => handleInputChange('windowsVersion', e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 rounded-xl text-white text-sm appearance-none outline-none transition-all disabled:opacity-50"
                  style={{ background: 'var(--surface-2, #1a1a1f)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', color: 'white' }}
                >
                  <option value="">Select Windows version...</option>
                  {formData.rdpType === 'docker' ? (
                    DOCKER_CATEGORY_ORDER.map((category) => {
                      const items = DOCKER_OS_VERSIONS.filter(v => v.category === category)
                      if (items.length === 0) return null
                      return (
                        <optgroup key={category} label={CATEGORY_LABELS[category]}>
                          {items.map((version) => (
                            <option key={version.id} value={version.id}>{version.name}</option>
                          ))}
                        </optgroup>
                      )
                    })
                  ) : (
                    CATEGORY_ORDER.map((category) => {
                      const items = groupedVersions[category] || []
                      if (items.length === 0) return null
                      return (
                        <optgroup key={category} label={CATEGORY_LABELS[category]}>
                          {items.map((version) => (
                            <option key={version.id} value={version.id}>{version.name}</option>
                          ))}
                        </optgroup>
                      )
                    })
                  )}
                </select>
                <style jsx>{`
                  select option { background: #1a1a1f; color: white; }
                  select optgroup { background: #111113; color: #8a8b9e; font-weight: 600; }
                `}</style>
              </div>

              {/* RDP Password */}
              <div>
                <label htmlFor="rdpPassword" className="block text-sm font-medium text-gray-300 mb-1.5">RDP Password</label>
                <input
                  id="rdpPassword"
                  type="password"
                  placeholder="Password for RDP access"
                  value={formData.rdpPassword}
                  onChange={(e) => handleInputChange('rdpPassword', e.target.value)}
                  disabled={loading}
                  className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 outline-none transition-all disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-1.5">Min 6 characters. This will be your Windows login password.</p>
              </div>

              {/* Price */}
              <div className="bg-gray-800/50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-gray-400">Installation Cost</span>
                <span className="text-lg font-bold text-white">Rp {installPrice.toLocaleString('id-ID')}</span>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="size-4 text-red-400 shrink-0" />
                  <span className="text-sm text-red-400">{error}</span>
                </div>
              )}

              {/* Turnstile captcha */}
              <div className="flex justify-center">
                <Turnstile
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken('')}
                  onExpire={() => setTurnstileToken('')}
                  options={{ theme: 'dark', size: 'normal' }}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBackToForm}
                  className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-all duration-150 text-sm cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !turnstileToken}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium py-3 rounded-lg transition-all duration-150 flex items-center justify-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    'Confirm & Install'
                  )}
                </button>
              </div>
            </>
          )}

          {/* Error state from VPS check */}
          {step === 'error' && (
            <>
              <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1.5">
                  {frozen ? <AlertTriangle className="size-3.5" /> : <XCircle className="size-3.5" />}
                  {frozen ? 'Account Temporarily Frozen' : 'VPS Check Failed'}
                </div>
                <p className="text-sm text-red-300">{checkError}</p>

                {failCount > 0 && !frozen && (
                  <p className="text-xs text-gray-500 mt-2">
                    Failed attempts: {failCount}/5 — account will be frozen for 5 minutes after 5 consecutive failures.
                  </p>
                )}

                {/* Show specs if available even on failure */}
                {specs && (
                  <div className="grid grid-cols-2 gap-2 text-sm mt-3 pt-3 border-t border-red-500/10">
                    <div><span className="text-gray-500">RAM:</span> <span className={specs.memoryGB >= 1 ? 'text-emerald-400' : 'text-red-400'}>{specs.memoryGB}GB</span></div>
                    <div><span className="text-gray-500">Disk:</span> <span className={specs.diskGB >= 20 ? 'text-emerald-400' : 'text-red-400'}>{specs.diskGB}GB</span></div>
                    <div><span className="text-gray-500">CPU:</span> <span className={specs.cpuCores >= 1 ? 'text-emerald-400' : 'text-red-400'}>{specs.cpuCores} Core(s)</span></div>
                    <div><span className="text-gray-500">KVM:</span> <span className={specs.kvmSupported ? 'text-emerald-400' : 'text-red-400'}>{specs.kvmSupported ? 'Supported' : 'Not Supported'}</span></div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleBackToForm}
                disabled={frozen}
                className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium py-2.5 rounded-lg transition-all duration-150 flex items-center justify-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed"
              >
                {frozen ? 'Account Frozen — Try Again Later' : 'Back to Form'}
              </button>
            </>
          )}

          {/* Show error in form step */}
          {step === 'form' && error && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <XCircle className="size-4 text-red-400 shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}
        </div>
      </form>

      {/* Notes */}
      <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-800/60">
          <h2 className="text-sm font-medium text-white">Important Notes</h2>
        </div>
        <div className="p-5 space-y-2.5 text-sm text-gray-500">
          <p>• Make sure your VPS is accessible and the root password is correct</p>
          <p>• VPS specs will be verified before installation begins</p>
          <p>• The installation process may take 10-30 minutes</p>
          <p>• Custom/optimized versions (ReviOS, AtlasOS, Ghost Spectre) offer better performance</p>
          <p>• UEFI versions require UEFI-compatible VPS hardware</p>
          <p>• Lite versions use fewer resources and are ideal for low-spec VPS</p>
        </div>
      </div>
    </div>
  )
}
