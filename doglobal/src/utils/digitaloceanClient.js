const https = require('https');
const http = require('http');

// Optional proxy agent support
let HttpsProxyAgent, HttpProxyAgent, SocksProxyAgent;
try {
  const httpsProxyAgentModule = require('https-proxy-agent');
  const httpProxyAgentModule = require('http-proxy-agent');
  const socksProxyAgentModule = require('socks-proxy-agent');
  
  // Handle different export styles
  HttpsProxyAgent = httpsProxyAgentModule.default || httpsProxyAgentModule.HttpsProxyAgent || httpsProxyAgentModule;
  HttpProxyAgent = httpProxyAgentModule.default || httpProxyAgentModule.HttpProxyAgent || httpProxyAgentModule;
  SocksProxyAgent = socksProxyAgentModule.default || socksProxyAgentModule.SocksProxyAgent || socksProxyAgentModule;
} catch (e) {
  console.warn('[DigitalOceanClient] Proxy agents not available. Install https-proxy-agent, http-proxy-agent, socks-proxy-agent for proxy support.');
}

class DigitalOceanClient {
  constructor(token, proxy = null) {
    this.token = token;
    this.baseURL = 'https://api.digitalocean.com/v2';
    this.proxy = proxy; // Proxy object: { protocol, host, port, auth? }
  }

  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      // Construct full URL properly
      const fullUrl = path.startsWith('/') 
        ? `${this.baseURL}${path}`
        : `${this.baseURL}/${path}`;
      
      const url = new URL(fullUrl);
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      };

      // Setup proxy if available
      let agent = null;
      if (this.proxy && (HttpsProxyAgent || HttpProxyAgent || SocksProxyAgent)) {
        const proxyUrl = this.proxy.auth
          ? `${this.proxy.protocol}://${this.proxy.auth.username}:${this.proxy.auth.password}@${this.proxy.host}:${this.proxy.port}`
          : `${this.proxy.protocol}://${this.proxy.host}:${this.proxy.port}`;
        
        if (this.proxy.protocol === 'socks4' || this.proxy.protocol === 'socks5') {
          if (SocksProxyAgent && typeof SocksProxyAgent === 'function') {
            try {
              agent = new SocksProxyAgent(proxyUrl);
            } catch (error) {
              console.error(`[DigitalOcean API] SOCKS proxy agent error: ${error.message}`);
            }
          }
        } else if (this.proxy.protocol === 'https') {
          if (HttpsProxyAgent && typeof HttpsProxyAgent === 'function') {
            try {
              agent = new HttpsProxyAgent(proxyUrl);
            } catch (error) {
              console.error(`[DigitalOcean API] HTTPS proxy agent error: ${error.message}`);
            }
          }
        } else {
          if (HttpProxyAgent && typeof HttpProxyAgent === 'function') {
            try {
              agent = new HttpProxyAgent(proxyUrl);
            } catch (error) {
              console.error(`[DigitalOcean API] HTTP proxy agent error: ${error.message}`);
            }
          }
        }
        
        if (agent) {
          options.agent = agent;
        }
      }


      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = data ? JSON.parse(data) : {};
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ status: res.statusCode, body: jsonData });
            } else {
              console.error(`[DigitalOcean API] ❌ ${method} ${fullUrl} - ${res.statusCode}: ${jsonData.message || 'Error'}`);
              const error = new Error(jsonData.message || `HTTP ${res.statusCode}`);
              error.status = res.statusCode;
              error.body = jsonData;
              reject(error);
            }
          } catch (error) {
            console.error(`[DigitalOcean API] ❌ Parse error: ${error.message}`);
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error(`[DigitalOcean API] ❌ Network error: ${error.message}`);
        reject(error);
      });

      if (body) {
        const bodyString = JSON.stringify(body);
        req.write(bodyString);
      }

      req.end();
    });
  }

  // Account endpoints
  async getAccount() {
    const response = await this.request('GET', '/account');
    return response.body.account;
  }

  // Balance endpoint
  async getBalance() {
    const response = await this.request('GET', '/customers/my/balance');
    return response.body;
  }

  // Droplet endpoints
  async createDroplet(dropletData) {
    // According to API docs, payload should be sent directly, not wrapped in { droplet: {...} }
    const response = await this.request('POST', '/droplets', dropletData);
    return response.body.droplet;
  }

  async getDroplet(dropletId) {
    const response = await this.request('GET', `/droplets/${dropletId}`);
    return response.body.droplet;
  }

  async listDroplets() {
    const response = await this.request('GET', '/droplets');
    return response.body.droplets;
  }

  async deleteDroplet(dropletId) {
    await this.request('DELETE', `/droplets/${dropletId}`);
    return true;
  }

  async rebootDroplet(dropletId) {
    const response = await this.request('POST', `/droplets/${dropletId}/actions`, {
      type: 'reboot'
    });
    return response.body.action;
  }

  async shutdownDroplet(dropletId) {
    const response = await this.request('POST', `/droplets/${dropletId}/actions`, {
      type: 'shutdown'
    });
    return response.body.action;
  }

  async powerOnDroplet(dropletId) {
    const response = await this.request('POST', `/droplets/${dropletId}/actions`, {
      type: 'power_on'
    });
    return response.body.action;
  }

  async rebuildDroplet(dropletId, image) {
    const response = await this.request('POST', `/droplets/${dropletId}/actions`, {
      type: 'rebuild',
      image: typeof image === 'string' ? image : image.slug
    });
    return response.body.action;
  }

  async resetDropletPassword(dropletId) {
    const response = await this.request('POST', `/droplets/${dropletId}/actions`, {
      type: 'password_reset'
    });
    return response.body.action;
  }

  // Region endpoints
  async listRegions() {
    const response = await this.request('GET', '/regions');
    return response.body.regions;
  }

  // Size endpoints
  async listSizes() {
    // Fetch all sizes by handling pagination
    let allSizes = [];
    let page = 1;
    const perPage = 200;
    
    while (true) {
      const response = await this.request('GET', `/sizes?page=${page}&per_page=${perPage}`);
      const sizes = response.body.sizes || [];
      
      if (sizes.length === 0) {
        break;
      }
      
      allSizes = allSizes.concat(sizes);
      
      // Check if there are more pages
      const total = response.body.meta?.total || allSizes.length;
      if (allSizes.length >= total) {
        break;
      }
      
      page++;
    }
    
    return allSizes;
  }

  // Image endpoints
  async listImages() {
    const response = await this.request('GET', '/images');
    return response.body.images;
  }

  async getImagesDistribution() {
    const response = await this.request('GET', '/images?type=distribution&page=1&per_page=200');
    return response.body.images;
  }
}

module.exports = DigitalOceanClient;

