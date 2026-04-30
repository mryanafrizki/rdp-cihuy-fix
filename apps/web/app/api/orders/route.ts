import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { checkRateLimit } from '@/lib/rate-limit';
import { notifyNewOrder, notifyError } from '@/lib/telegram-notify';
import { db, schema } from '@/lib/db';
import { deductBalance, addBalance } from '@/lib/db/operations';
import { eq } from 'drizzle-orm';
import { signRequest } from '@/lib/hmac-sign';
import { verifyTurnstile } from '@/lib/turnstile';

// Valid OS version string IDs matching production worker BASE_IMAGE_URL_MAP keys
const VALID_OS_VERSIONS = [
  'win_11revi_h25', 'win_11atlas_h25', 'win_11atlas_h22', 'win_11ghost',
  'win_10atlas', 'win_10ghost', 'win_11_pro', 'win_10_ent', 'win_7',
  'win_11_uefi', 'win_10_uefi', 'win_7_sp1_lite',
  'win_2025', 'win_22', 'win_19', 'win_2016', 'win_2012R2', 'win_2008',
  'win_2022_uefi', 'win_2019_uefi', 'win_2016_uefi', 'win_2012R2_uefi',
  'win_2022_lite', 'win_2016_lite', 'win_2012R2_lite',
  'docker_win11_pro', 'docker_win11_ltsc', 'docker_win11_ent',
  'docker_win10_pro', 'docker_win10_ltsc', 'docker_win10_ent',
  'docker_win81_ent', 'docker_win7', 'docker_vista', 'docker_xp', 'docker_2000',
  'docker_srv2022', 'docker_srv2019', 'docker_srv2016', 'docker_srv2012', 'docker_srv2008', 'docker_srv2025', 'docker_srv2003',
  'docker_tiny11',
];

function isValidIP(ip: string): boolean {
  // Only allow standard dotted-decimal IPv4 — reject IPv6, decimal, octal, hex
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  const parts = ip.split('.');
  // Reject octal notation (leading zeros like 0177)
  if (parts.some(p => p.length > 1 && p.startsWith('0'))) return false;
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return true;
  if (parts[0] === 10) return true; // 10.0.0.0/8
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
  if (parts[0] === 127) return true; // 127.0.0.0/8
  if (parts[0] === 0) return true; // 0.0.0.0/8
  if (ip === '168.144.34.139' || ip === '139.59.56.240') return true; // Our own servers
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    // Authenticate user
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Rate limit: 3 requests per minute per user
    const { allowed } = checkRateLimit(`orders:${userId}`, 3, 60000)
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait.' },
        { status: 429 }
      );
    }

    // ensureUser is no longer needed — Auth.js users are created at signup via Drizzle

    // Parse and validate body
    const body = await request.json();
    const { vps_ip, root_password, windows_version, rdp_password, rdp_type, turnstileToken } = body;

    // Verify Turnstile captcha
    if (!await verifyTurnstile(turnstileToken)) {
      return NextResponse.json({ success: false, error: 'Security verification failed.' }, { status: 400 });
    }

    // Validate rdp_type
    const validRdpType = rdp_type === 'docker' ? 'docker' : 'dedicated'; // default to dedicated

    // Validate vps_ip
    if (!vps_ip || !isValidIP(vps_ip)) {
      return NextResponse.json(
        { success: false, error: 'Invalid VPS IP address' },
        { status: 400 }
      );
    }

    // SSRF protection: block private/internal IP ranges
    if (isPrivateIP(vps_ip)) {
      return NextResponse.json(
        { success: false, error: 'Private/internal IP addresses are not allowed' },
        { status: 400 }
      );
    }

    // Validate root_password
    if (!root_password || root_password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Root password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Validate windows_version
    if (!windows_version || !VALID_OS_VERSIONS.includes(windows_version)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Windows version' },
        { status: 400 }
      );
    }

    // Validate rdp_password
    if (!rdp_password || rdp_password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'RDP password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Fetch install price from settings
    const [priceSettings] = await db
      .select({ value: schema.appSettings.value })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, 'install_price'))
      .limit(1)
    const price = typeof priceSettings?.value === 'object' ? ((priceSettings.value as Record<string, number>).amount || 1000) : (parseInt(priceSettings?.value as string) || 1000);

    // Always deduct balance — no skip_payment flag (security fix)
    const deductResult = await deductBalance(userId, price)
    if (!deductResult) {
      return NextResponse.json({ success: false, error: 'Insufficient balance' }, { status: 400 })
    }

    // Generate install_id
    const install_id = `rdp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create installation first (so we can link the transaction to it)
    let installation
    try {
      const [inserted] = await db
        .insert(schema.installations)
        .values({
          userId,
          installId: install_id,
          vpsIp: vps_ip,
          windowsVersion: windows_version,
          rdpType: validRdpType,
          status: 'pending',
          rdpPassword: rdp_password,
        })
        .returning({
          id: schema.installations.id,
          installId: schema.installations.installId,
          status: schema.installations.status,
        })
      installation = inserted
    } catch (installError: any) {
      // Rollback credit atomically
      await addBalance(userId, price)
      
      return NextResponse.json(
        { success: false, error: 'Failed to create installation' },
        { status: 500 }
      );
    }

    if (!installation) {
      // Rollback credit atomically
      await addBalance(userId, price)
      
      return NextResponse.json(
        { success: false, error: 'Failed to create installation' },
        { status: 500 }
      );
    }

    // Create deduction transaction linked to installation
    try {
      await db
        .insert(schema.transactions)
        .values({
          userId,
          amount: String(-price),
          type: 'deduction',
          status: 'completed',
          paymentId: `install_${installation.id}`,
        })
    } catch (transactionError: any) {
      // Rollback credit deduction atomically
      await addBalance(userId, price)
      
      return NextResponse.json(
        { success: false, error: 'Failed to create transaction' },
        { status: 500 }
      );
    }

    // Step 1: Trigger installation via Cloudflare Worker (get tokens)
    const workerUrl = process.env.WORKER_URL || 'https://rotate.eov.my.id';
    const apiSecret = process.env.WORKER_API_SECRET;
    const ubuntuServiceUrl = process.env.UBUNTU_SERVICE_URL;
    const ubuntuApiKey = process.env.UBUNTU_API_KEY;

    if (!ubuntuServiceUrl) {
      console.error('UBUNTU_SERVICE_URL not configured');
      notifyError('/api/orders', 'UBUNTU_SERVICE_URL not configured')
    }

    let workerInitialized = false;
    let triggerSuccess = false;

    if (apiSecret) {
      try {
        const workerResponse = await fetch(`${workerUrl}/api/installation/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: apiSecret,
            vpsIp: vps_ip,
            osVersion: windows_version,
            rdpPort: 22,
            metadata: {
              userId,
              installId: install_id,
              installationId: installation.id,
            }
          })
        });
        
        if (workerResponse.ok) {
          workerInitialized = true;
          await db
            .update(schema.installations)
            .set({ 
              status: 'in_progress',
              progressMessage: 'Installation initialized, connecting to VPS...'
            })
            .where(eq(schema.installations.id, installation.id));
        }
      } catch (workerError) {
        console.error('Worker init error:', workerError);
        notifyError('/api/orders', 'Worker init failed: ' + String(workerError))
      }
    }

    // Step 2: Trigger ubuntu-service to SSH into VPS target and install RDP
    if (ubuntuApiKey && ubuntuServiceUrl) {
      try {
        const triggerBody = JSON.stringify({
          installation_id: installation.id,
          vps_ip: vps_ip,
          root_password: root_password,
          windows_version: windows_version,
          rdp_password: rdp_password,
          rdp_type: validRdpType
        });
        const { timestamp, signature } = signRequest(triggerBody, ubuntuApiKey);
        const triggerResponse = await fetch(`${ubuntuServiceUrl}/api/trigger-rdp`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-API-Key': ubuntuApiKey,
            'X-Timestamp': timestamp,
            'X-Signature': signature,
          },
          body: triggerBody
        });
        
        if (triggerResponse.ok) {
          triggerSuccess = true;
          await db
            .update(schema.installations)
            .set({ 
              status: 'in_progress',
              progressStep: 1,
              progressMessage: 'Connecting to VPS target...'
            })
            .where(eq(schema.installations.id, installation.id));
        } else {
          const errText = await triggerResponse.text();
          console.error('Ubuntu service trigger failed:', errText);
          notifyError('/api/orders', 'Ubuntu trigger failed: ' + errText, { vps_ip })
          await db
            .update(schema.installations)
            .set({ 
              status: 'failed',
              progressMessage: `Failed to trigger installation: ${errText}`
            })
            .where(eq(schema.installations.id, installation.id));
          // Auto-refund on trigger failure
          await addBalance(userId, price)
          try {
            await db.insert(schema.transactions).values({
              userId,
              amount: String(price),
              type: 'topup',
              status: 'completed',
              paymentId: `refund_${installation.id}`,
            })
          } catch { /* refund tx already exists */ }
        }
      } catch (triggerError: any) {
        console.error('Ubuntu service trigger error:', triggerError);
        notifyError('/api/orders', 'Ubuntu trigger error: ' + triggerError.message, { vps_ip })
        await db
          .update(schema.installations)
          .set({ 
            status: 'failed',
            progressMessage: `Connection to installation service failed: ${triggerError.message}`
          })
          .where(eq(schema.installations.id, installation.id));
        // Auto-refund on connection failure
        await addBalance(userId, price)
        try {
          await db.insert(schema.transactions).values({
            userId,
            amount: String(price),
            type: 'topup',
            status: 'completed',
            paymentId: `refund_${installation.id}`,
          })
        } catch { /* refund tx already exists */ }
      }
    } else {
      console.error('UBUNTU_API_KEY or UBUNTU_SERVICE_URL not configured');
      notifyError('/api/orders', 'UBUNTU_API_KEY or UBUNTU_SERVICE_URL not configured')
      await db
        .update(schema.installations)
        .set({ 
          status: 'failed',
          progressMessage: 'Installation service not configured'
        })
        .where(eq(schema.installations.id, installation.id));
      // Auto-refund when service not configured
      await addBalance(userId, price)
      try {
        await db.insert(schema.transactions).values({
          userId,
          amount: String(price),
          type: 'topup',
          status: 'completed',
          paymentId: `refund_${installation.id}`,
        })
      } catch { /* refund tx already exists */ }
    }

    // Telegram notification only on successful trigger (fire-and-forget)
    if (triggerSuccess) {
      notifyNewOrder(session.user.email || '', vps_ip, windows_version)
    }

    return NextResponse.json({
      success: true,
      data: {
        installation_id: installation.id,
        install_id: installation.installId,
        status: installation.status,
        worker_triggered: workerInitialized,
      },
    });
  } catch (error) {
    console.error('Order creation error:', error);
    notifyError('/api/orders', String(error))
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
