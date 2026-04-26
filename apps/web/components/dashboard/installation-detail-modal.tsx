'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'
import { ProgressBar } from './progress-bar'

type InstallationStatus = 'pending' | 'in_progress' | 'completed' | 'failed'
type RdpType = 'docker' | 'dedicated'

interface Installation {
  id: string
  vps_ip: string
  windows_version: string
  rdp_type: RdpType
  status: InstallationStatus
  created_at: string
  current_step?: number
  total_steps?: number
  step_message?: string
  rdp_port?: number
  rdp_username?: string
}

interface InstallationDetailModalProps {
  installation: Installation
  onClose: () => void
}

export function InstallationDetailModal({ installation, onClose }: InstallationDetailModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: InstallationStatus) => {
    const colors = {
      completed: 'text-green-600 dark:text-green-400',
      in_progress: 'text-blue-600 dark:text-blue-400',
      pending: 'text-yellow-600 dark:text-yellow-400',
      failed: 'text-red-600 dark:text-red-400'
    }
    return colors[status]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Installation Details</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  ID: {installation.id}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Section */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Status</h3>
              <div className={`text-lg font-semibold ${getStatusColor(installation.status)}`}>
                {installation.status.replace('_', ' ').toUpperCase()}
              </div>
              {installation.status === 'in_progress' && installation.current_step && installation.total_steps && (
                <ProgressBar
                  step={installation.current_step}
                  totalSteps={installation.total_steps}
                  message={installation.step_message || 'Processing...'}
                  status="in_progress"
                />
              )}
            </div>

            {/* Installation Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Installation Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">VPS IP</p>
                  <p className="font-medium">{installation.vps_ip}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Windows Version</p>
                  <p className="font-medium">{installation.windows_version}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">RDP Type</p>
                  <p className="font-medium">{installation.rdp_type === 'docker' ? 'Docker' : 'Dedicated'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDate(installation.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Credentials Section - Only show if completed */}
            {installation.status === 'completed' && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">RDP Credentials</h3>
                <div className="space-y-3 p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">IP Address</p>
                      <p className="font-mono text-sm">{installation.vps_ip}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyToClipboard(installation.vps_ip, 'ip')}
                    >
                      {copiedField === 'ip' ? (
                        <CheckCircle2 className="size-4 text-green-600" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Username</p>
                      <p className="font-mono text-sm">{installation.rdp_username || 'Administrator'}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyToClipboard(installation.rdp_username || 'Administrator', 'username')}
                    >
                      {copiedField === 'username' ? (
                        <CheckCircle2 className="size-4 text-green-600" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Port</p>
                      <p className="font-mono text-sm">{installation.rdp_port || 22}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyToClipboard(String(installation.rdp_port || 22), 'port')}
                    >
                      {copiedField === 'port' ? (
                        <CheckCircle2 className="size-4 text-green-600" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-medium">Password Security Notice</p>
                      <p className="mt-1">The RDP password was displayed once after installation completion. If you didn't save it, you'll need to reset it through your VPS provider.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Failed Status Message */}
            {installation.status === 'failed' && (
              <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
                <p className="text-sm font-medium">Installation Failed</p>
                <p className="text-sm mt-1">
                  {installation.step_message || 'The installation process encountered an error. Please contact support or try creating a new installation.'}
                </p>
              </div>
            )}

            {/* Pending/In Progress Message */}
            {(installation.status === 'pending' || installation.status === 'in_progress') && (
              <div className="p-4 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <p className="text-sm font-medium">Installation in Progress</p>
                <p className="text-sm mt-1">
                  Your RDP installation is being processed. This may take 10-30 minutes. You'll be notified when it's complete.
                </p>
              </div>
            )}

            {/* Close Button */}
            <div className="pt-4 border-t border-border">
              <Button onClick={onClose} className="w-full">
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
