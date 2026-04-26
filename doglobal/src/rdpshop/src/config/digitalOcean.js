const axios = require('axios');

class DigitalOcean {
  constructor() {
    // Menyimpan token dari masing-masing admin
    this.tokens = {};
  }

  // Mendapatkan daftar semua droplets
  async getDroplets(adminId) {
    try {
      const token = this.tokens[adminId];
      const response = await axios.get('https://api.digitalocean.com/v2/droplets', {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          per_page: 100 // Ambil hingga 100 droplets
        }
      });
      return response.data.droplets;
    } catch (error) {
      console.error('Error fetching droplets:', error.message);
      throw error;
    }
  }

  setToken(adminId, token) {
    this.tokens[adminId] = token;
  }

  // Mendapatkan list image distribusi yang tersedia (Linux)
  async getDistributionImages(adminId) {
    try {
      const token = this.tokens[adminId];
      const response = await axios.get('https://api.digitalocean.com/v2/images', {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          type: 'distribution',
          per_page: 100
        }
      });
      return response.data.images;
    } catch (error) {
      console.error('Error fetching distribution images:', error.message);
      throw error;
    }
  }

  // Mendapatkan list region yang tersedia
  async getRegions(adminId) {
    try {
      const token = this.tokens[adminId];
      const response = await axios.get('https://api.digitalocean.com/v2/regions', {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          per_page: 100 // Ambil semua region
        }
      });
      // Filter hanya region yang aktif dan tersedia
      return response.data.regions.filter(r => r.available);
    } catch (error) {
      console.error('Error fetching regions:', error.message);
      throw error;
    }
  }

  // Mendapatkan list size yang tersedia
  async getSizes(adminId) {
    try {
      const token = this.tokens[adminId];
      const response = await axios.get('https://api.digitalocean.com/v2/sizes', {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          per_page: 100 // Ambil semua size
        }
      });
      return response.data.sizes;
    } catch (error) {
      console.error('Error fetching sizes:', error.message);
      throw error;
    }
  }

  // Mendapatkan detail sebuah image berdasarkan slug
  async getImageInfo(adminId, imageSlug) {
    try {
      const token = this.tokens[adminId];
      const response = await axios.get(`https://api.digitalocean.com/v2/images/${imageSlug}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return response.data.image;
    } catch (error) {
      console.error('Error fetching image info:', error.message);
      return null;
    }
  }

  // Membuat droplet baru di DigitalOcean
  // config harus berisi { name, region, size, image, user_data?, ... }
  async createDroplet(adminId, config) {
    try {
      const token = this.tokens[adminId];
      const payload = {
        name: config.name,
        region: config.region,
        size: config.size,
        image: config.image,
        user_data: config.user_data || undefined,
        ssh_keys: config.ssh_keys || [],  // Jika perlu, sesuaikan user key
        backups: false,
        ipv6: false,
        monitoring: true,
        tags: config.tags || []
      };

      const response = await axios.post('https://api.digitalocean.com/v2/droplets', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.droplet;

    } catch (error) {
      console.error('Error creating droplet:', error.message);
      throw error;
    }
  }

  // Menunggu droplet ready (active) dan return data droplet terbaru
  async waitForDropletReady(adminId, dropletId, timeout = 300000, interval = 10000) {
    const token = this.tokens[adminId];
    const start = Date.now();

    while ((Date.now() - start) < timeout) {
      try {
        const response = await axios.get(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const droplet = response.data.droplet;
        if (droplet.status === 'active') {
          return droplet;
        }
      } catch (error) {
        console.error('Error fetching droplet status:', error.message);
      }
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('Timeout waiting for droplet to become active');
  }

  // Reboot sebuah droplet
  async rebootDroplet(adminId, dropletId) {
    try {
      const token = this.tokens[adminId];
      const response = await axios.post(`https://api.digitalocean.com/v2/droplets/${dropletId}/actions`, 
        { type: 'reboot' },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data.action;
    } catch (error) {
      console.error('Error rebooting droplet:', error.message);
      throw error;
    }
  }

  // Menghapus sebuah droplet
  async deleteDroplet(adminId, dropletId) {
    try {
      const token = this.tokens[adminId];
      await axios.delete(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return true;
    } catch (error) {
      console.error('Error deleting droplet:', error.message);
      throw error;
    }
  }
  
}

module.exports = new DigitalOcean();
