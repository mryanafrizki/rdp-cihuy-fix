/**
 * Windows versions available for RDP installations
 * Includes both desktop and server versions
 */
export const WINDOWS_VERSIONS = [
  // Desktop - Custom/Optimized
  { id: 'win_11revi_h25', name: 'Windows 11 ReviOS H2 2025', category: 'desktop' as const, price: 1000 },
  { id: 'win_11atlas_h25', name: 'Windows 11 AtlasOS H2 2025', category: 'desktop' as const, price: 1000 },
  { id: 'win_11atlas_h22', name: 'Windows 11 AtlasOS H2 2022', category: 'desktop' as const, price: 1000 },
  { id: 'win_11ghost', name: 'Windows 11 Ghost Spectre', category: 'desktop' as const, price: 1000 },
  { id: 'win_10atlas', name: 'Windows 10 AtlasOS', category: 'desktop' as const, price: 1000 },
  { id: 'win_10ghost', name: 'Windows 10 Ghost Spectre', category: 'desktop' as const, price: 1000 },
  // Desktop - Standard
  { id: 'win_11_pro', name: 'Windows 11 Pro', category: 'desktop' as const, price: 1000 },
  { id: 'win_10_ent', name: 'Windows 10 Enterprise', category: 'desktop' as const, price: 1000 },
  { id: 'win_7', name: 'Windows 7', category: 'desktop' as const, price: 1000 },
  // Desktop - UEFI
  { id: 'win_11_uefi', name: 'Windows 11 UEFI', category: 'uefi' as const, price: 1000 },
  { id: 'win_10_uefi', name: 'Windows 10 UEFI', category: 'uefi' as const, price: 1000 },
  // Desktop - Lite
  { id: 'win_7_sp1_lite', name: 'Windows 7 SP1 Lite', category: 'lite' as const, price: 1000 },
  // Server - Standard
  { id: 'win_2025', name: 'Windows Server 2025', category: 'server' as const, price: 1000 },
  { id: 'win_22', name: 'Windows Server 2022', category: 'server' as const, price: 1000 },
  { id: 'win_19', name: 'Windows Server 2019', category: 'server' as const, price: 1000 },
  { id: 'win_2016', name: 'Windows Server 2016', category: 'server' as const, price: 1000 },
  { id: 'win_2012R2', name: 'Windows Server 2012 R2', category: 'server' as const, price: 1000 },
  { id: 'win_2008', name: 'Windows Server 2008', category: 'server' as const, price: 1000 },
  // Server - UEFI
  { id: 'win_2022_uefi', name: 'Windows Server 2022 UEFI', category: 'uefi' as const, price: 1000 },
  { id: 'win_2019_uefi', name: 'Windows Server 2019 UEFI', category: 'uefi' as const, price: 1000 },
  { id: 'win_2016_uefi', name: 'Windows Server 2016 UEFI', category: 'uefi' as const, price: 1000 },
  { id: 'win_2012R2_uefi', name: 'Windows Server 2012 R2 UEFI', category: 'uefi' as const, price: 1000 },
  // Server - Lite
  { id: 'win_2022_lite', name: 'Windows Server 2022 Lite', category: 'lite' as const, price: 1000 },
  { id: 'win_2016_lite', name: 'Windows Server 2016 Lite', category: 'lite' as const, price: 1000 },
  { id: 'win_2012R2_lite', name: 'Windows Server 2012 R2 Lite', category: 'lite' as const, price: 1000 },
] as const;

export type WindowsVersionId = typeof WINDOWS_VERSIONS[number]['id'];
export type WindowsCategory = 'desktop' | 'server' | 'lite' | 'uefi';

/**
 * RDP port configuration
 * Default: 3389 (standard RDP port)
 */
export const RDP_PORT = 3389;

/**
 * Payment expiry time in minutes
 * QR codes and payment links expire after this duration
 */
export const PAYMENT_EXPIRY_MINUTES = 5;

/**
 * Installation timeout in minutes
 * Maximum time allowed for RDP installation process
 */
export const INSTALLATION_TIMEOUT_MINUTES = 30;

/**
 * Installation progress steps
 * Defines the stages of RDP installation
 */
export const INSTALLATION_STEPS = {
  PENDING: 0,
  PREPARING: 1,
  DOWNLOADING: 2,
  INSTALLING: 3,
  CONFIGURING: 4,
  TESTING: 5,
  COMPLETED: 6,
} as const;

/**
 * RDP types available
 */
export const RDP_TYPES = ['docker', 'dedicated'] as const;

/**
 * User roles
 */
export const USER_ROLES = ['user', 'admin', 'super_admin'] as const;

/**
 * Transaction types
 */
export const TRANSACTION_TYPES = ['topup', 'deduction'] as const;

/**
 * Transaction statuses
 */
export const TRANSACTION_STATUSES = ['pending', 'completed', 'failed'] as const;

/**
 * Installation statuses
 */
export const INSTALLATION_STATUSES = ['pending', 'in_progress', 'completed', 'failed'] as const;
