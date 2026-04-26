import express from 'express';
import { config } from './config';
import packageJson from '../package.json';
import { installDockerRDP, type InstallationProgress } from './installers/docker-rdp';
import { installDedicatedRDP } from './installers/dedicated-rdp';

const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ubuntu-service',
    version: packageJson.version,
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint to trigger RDP installation
app.post('/api/trigger-rdp', async (req, res) => {
  // Validate API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key'
    });
  }

  // Validate required fields
  const { installation_id, vps_ip, root_password, windows_version, rdp_password, rdp_type } = req.body;
  
  if (!installation_id || !vps_ip || !root_password || !windows_version || !rdp_password || !rdp_type) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: installation_id, vps_ip, root_password, windows_version, rdp_password, rdp_type'
    });
  }

  if (rdp_type !== 'docker' && rdp_type !== 'dedicated') {
    return res.status(400).json({
      success: false,
      error: 'Invalid rdp_type: must be "docker" or "dedicated"'
    });
  }

  // Log installation start
  console.log(`[${installation_id}] Starting ${rdp_type} RDP installation for ${vps_ip}`);

  // Start installation in background (don't await)
  if (rdp_type === 'docker') {
    installDockerRDP(
      vps_ip,
      root_password,
      windows_version,
      rdp_password,
      (progress: InstallationProgress) => {
        console.log(`[${installation_id}] Progress: ${progress.message} (${progress.step}/${progress.totalSteps})`);
      },
      (log: string) => {
        console.log(`[${installation_id}] ${log}`);
      }
    ).then((result) => {
      if (result.success) {
        console.log(`[${installation_id}] Installation completed successfully`);
      } else {
        console.error(`[${installation_id}] Installation failed: ${result.error}`);
      }
    }).catch((error) => {
      console.error(`[${installation_id}] Installation error:`, error);
    });
  } else {
    installDedicatedRDP(
      vps_ip,
      root_password,
      windows_version,
      rdp_password,
      (progress: InstallationProgress) => {
        console.log(`[${installation_id}] Progress: ${progress.message} (${progress.step}/${progress.totalSteps})`);
      },
      (log: string) => {
        console.log(`[${installation_id}] ${log}`);
      }
    ).then((result) => {
      if (result.success) {
        console.log(`[${installation_id}] Installation completed successfully`);
      } else {
        console.error(`[${installation_id}] Installation failed: ${result.error}`);
      }
    }).catch((error) => {
      console.error(`[${installation_id}] Installation error:`, error);
    });
  }

  // Respond immediately with 202 Accepted
  res.status(202).json({
    success: true,
    message: 'Installation started',
    installation_id
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`Ubuntu service running on port ${config.port}`);
});
