const Proxy = require('../models/Proxy');
const UserSettings = require('../models/UserSettings');
const { connectMongoDB } = require('./mongodb');

const MAX_PROXIES = 30;

class ProxyDB {
  constructor(userId) {
    this.userId = userId.toString();
  }

  async load() {
    await connectMongoDB();
    return {
      proxies: await Proxy.find({ userId: this.userId }).sort({ createdAt: 1 }),
      selectedProxyId: await this._getSelectedProxyId()
    };
  }

  async _getSelectedProxyId() {
    await connectMongoDB();
    const settings = await UserSettings.findOne({ userId: this.userId });
    return settings?.selectedProxyId || null;
  }

  async getAll() {
    await connectMongoDB();
    const proxies = await Proxy.find({ userId: this.userId }).sort({ createdAt: 1 });
    return proxies.map(p => ({
      id: p.proxyId,
      protocol: p.protocol,
      host: p.host,
      port: p.port,
      auth: p.auth?.username || p.auth?.password ? {
        username: p.auth.username || '',
        password: p.auth.password || ''
      } : undefined,
      createdAt: p.createdAt
    }));
  }

  async get(proxyId) {
    await connectMongoDB();
    const proxy = await Proxy.findOne({ userId: this.userId, proxyId });
    if (!proxy) return null;
    return {
      id: proxy.proxyId,
      protocol: proxy.protocol,
      host: proxy.host,
      port: proxy.port,
      auth: proxy.auth?.username || proxy.auth?.password ? {
        username: proxy.auth.username || '',
        password: proxy.auth.password || ''
      } : undefined,
      createdAt: proxy.createdAt
    };
  }

  async add(proxy) {
    await connectMongoDB();
    
    // Check limit
    const count = await Proxy.countDocuments({ userId: this.userId });
    if (count >= MAX_PROXIES) {
      throw new Error(`Maksimal ${MAX_PROXIES} proxy per user`);
    }

    const newProxy = new Proxy({
      userId: this.userId,
      ...proxy,
      createdAt: new Date()
    });

    await newProxy.save();
    
    return {
      id: newProxy.proxyId,
      protocol: newProxy.protocol,
      host: newProxy.host,
      port: newProxy.port,
      auth: newProxy.auth,
      createdAt: newProxy.createdAt
    };
  }

  async remove(proxyId) {
    await connectMongoDB();
    
    // If removed proxy was selected, clear selection
    const settings = await UserSettings.findOne({ userId: this.userId });
    if (settings?.selectedProxyId === proxyId) {
      await UserSettings.findOneAndUpdate(
        { userId: this.userId },
        { selectedProxyId: null, useProxy: false },
        { upsert: true }
      );
    }
    
    const result = await Proxy.deleteOne({ userId: this.userId, proxyId });
    return result.deletedCount > 0;
  }

  async setSelected(proxyId) {
    await connectMongoDB();
    
    if (proxyId === null) {
      await UserSettings.findOneAndUpdate(
        { userId: this.userId },
        { selectedProxyId: null, useProxy: false },
        { upsert: true }
      );
      return null;
    }
    
    // Verify proxy exists
    const proxy = await this.get(proxyId);
    if (!proxy) {
      throw new Error('Proxy tidak ditemukan');
    }
    
    await UserSettings.findOneAndUpdate(
      { userId: this.userId },
      { selectedProxyId: proxyId, useProxy: true },
      { upsert: true }
    );
    
    return proxy;
  }

  async getSelected() {
    await connectMongoDB();
    const settings = await UserSettings.findOne({ userId: this.userId });
    if (!settings || !settings.selectedProxyId) {
      return null;
    }
    
    return await this.get(settings.selectedProxyId);
  }

  async getSettings() {
    await connectMongoDB();
    const settings = await UserSettings.findOne({ userId: this.userId });
    return settings || {
      userId: this.userId,
      selectedProxyId: null,
      useProxy: false
    };
  }

  async setUseProxy(useProxy) {
    await connectMongoDB();
    await UserSettings.findOneAndUpdate(
      { userId: this.userId },
      { useProxy },
      { upsert: true }
    );
  }

  async hasProxies() {
    await connectMongoDB();
    const count = await Proxy.countDocuments({ userId: this.userId });
    return count > 0;
  }

  async count() {
    await connectMongoDB();
    return await Proxy.countDocuments({ userId: this.userId });
  }
}

module.exports = ProxyDB;
