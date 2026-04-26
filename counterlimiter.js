const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

class CounterLimiter {
  constructor({ limit, windowMs, backoff = [], escalateBlocks = [], persistFile = null }) {
    this.limit = limit;
    this.windowMs = windowMs;
    // backoff: legacy (count-based) - kept for compatibility (unused in strike mode)
    this.backoff = Array.isArray(backoff)
      ? [...backoff].sort((a, b) => (a.count || 0) - (b.count || 0))
      : [];
    // escalateBlocks: array of durations (ms) per offense index: [first, second, third, ...]
    this.escalateBlocks = Array.isArray(escalateBlocks) ? escalateBlocks : [];
    // userId -> { count, windowStart, blockUntilTs, offenses }
    this.map = new Map();
    
    // Persistence
    this.persistFile = persistFile;
    // PENTING: Debounce save operations untuk mencegah blocking
    this.saveTimeout = null;
    this.savePending = false;
    this.saveDebounceMs = 1000; // Save setelah 1 detik idle (bukan setiap increment)
    if (this.persistFile) {
      // PENTING: Load async tanpa blocking constructor
      this.load().catch(e => {
        console.error(`[LIMITER] Failed to load from ${this.persistFile}:`, e.message);
      });
    }
  }
  
  _now() { return Date.now(); }
  
  // Getter to expose internal map for admin access
  get _users() {
    return this.map;
  }

  _state(userId) {
    const now = this._now();
    let s = this.map.get(userId);
    
    // Check if window expired first
    const windowExpired = !s || (now - (s?.windowStart || now)) >= this.windowMs;
    
    if (windowExpired) {
      // When window resets, keep any existing blockUntilTs if still in the future
      const blockUntilTs = s?.blockUntilTs && s.blockUntilTs > now ? s.blockUntilTs : 0;
      // PENTING: Reset offenses ketika window expired, meskipun masih ada block aktif
      // Karena window adalah periode untuk track offense, jadi kalau window habis, offense harus di-reset
      // Block time tetap dipertahankan sampai expired, tapi offenses di-reset ke 0
      const offenses = 0;
      s = { count: 0, windowStart: now, blockUntilTs, offenses };
      this.map.set(userId, s);
      return s;
    }
    
    // Clear expired block and reset count (only if window hasn't expired)
    // PENTING: Reset count hanya jika block sudah expired DAN window belum expired
    // Jika window sudah expired, count sudah di-reset di atas
    if (s && s.blockUntilTs && s.blockUntilTs <= now) {
      // PENTING: Block sudah expired, clear block time
      const oldCount = s.count;
      const oldOffenses = s.offenses || 0;
      const oldBlockUntilTs = s.blockUntilTs;
      s.blockUntilTs = 0; // PENTING: Clear block time
      // PENTING: Reset count setelah block expired agar user bisa create lagi
      // Tapi hanya jika window belum expired (jika window expired, sudah di-reset di atas)
      if (!windowExpired) {
        // PENTING: Reset count ke 0 agar user bisa create lagi
        // Ini penting untuk offense escalation: setelah block expired, count reset, lalu saat mencapai limit lagi, offense naik
        s.count = 0;
        // Log untuk debugging: reset count setelah block expired
        // PENTING: Log ini penting untuk trace offense escalation
        if (oldCount > 0 || oldOffenses > 0) {
          const blockDuration = oldBlockUntilTs > 0 ? (now - oldBlockUntilTs) : 0;
          console.info(`[LIMITER] ✅ Block expired for ${userId}: reset count ${oldCount} → 0, clear block (offenses: ${oldOffenses} preserved, window still active, block expired ${Math.round(blockDuration/1000)}s ago)`);
          console.info(`[LIMITER] 📊 State after block expired: count=0, offenses=${oldOffenses}, blockUntilTs=0, next offense will be #${oldOffenses + 1} when limit reached again`);
        }
      } else {
        // Window sudah expired, tapi block juga expired
        // PENTING: Pastikan count dan offenses sudah di-reset (sudah di-handle di atas)
        // Tapi pastikan blockUntilTs di-clear
        if (oldBlockUntilTs > 0) {
          console.info(`[LIMITER] ✅ Block and window expired for ${userId}: reset count ${oldCount} → 0, offenses ${oldOffenses} → 0, clear block`);
        }
      }
      // Don't reset offenses yet, only when window resets
      // PENTING: Offenses tetap dipertahankan untuk progression ke offense berikutnya (jika window belum expired)
      // PENTING: Pastikan map di-update setelah clear block dan reset count
      this.map.set(userId, s);
    }
    
    return s;
  }

  can(userId) {
    const s = this._state(userId); // PENTING: _state() akan update state jika block/window expired
    const now = this._now();
    // Jika sedang blocked, tidak bisa
    if (s.blockUntilTs && s.blockUntilTs > now) {
      return false;
    }
    // PENTING: count < limit berarti masih bisa (count 0,1,2 untuk limit 3 masih bisa)
    // count >= limit berarti sudah tidak bisa (count 3 untuk limit 3 sudah tidak bisa)
    // PENTING: Jika block expired tapi count masih >= limit, ini bug - log untuk debugging
    if (s.count >= this.limit && (!s.blockUntilTs || s.blockUntilTs <= now)) {
      console.warn(`[LIMITER] ⚠️ User ${userId} has count=${s.count} >= limit=${this.limit} but block expired - this should not happen! State:`, {
        count: s.count,
        offenses: s.offenses || 0,
        blockUntilTs: s.blockUntilTs || 0,
        windowStart: s.windowStart || 0
      });
      // PENTING: Force reset count jika block expired (safety fix)
      if (!s.blockUntilTs || s.blockUntilTs <= now) {
        console.info(`[LIMITER] 🔧 Force resetting count for ${userId}: ${s.count} → 0 (block expired)`);
        s.count = 0;
        this.map.set(userId, s);
      }
    }
    return s.count < this.limit;
  }

  inc(userId) {
    const s = this._state(userId);
    let before = s.count; // Gunakan let agar bisa di-update
    const currentOffense = s.offenses || 0;
    
    // PENTING: Validasi bahwa count tidak boleh negatif atau terlalu besar
    // Ini untuk mencegah bug di mana count langsung melompat
    if (before < 0) {
      console.warn(`[LIMITER] Warning: User ${userId} has negative count (${before}), resetting to 0`);
      s.count = 0;
      before = 0; // Update before
    }
    
    // PENTING: Validasi bahwa count tidak boleh lebih besar dari limit sebelum increment
    // Jika count sudah >= limit, berarti ada bug atau state tidak di-reset dengan benar
    // PENTING: Jika count sudah >= limit, kemungkinan block sudah expired tapi count belum di-reset
    // Atau window sudah expired tapi state belum di-update dengan benar
    const now = this._now();
    if (before >= this.limit) {
      // PENTING: Jika count sudah >= limit, cek apakah block sudah expired
      // Jika block sudah expired, reset count ke 0 (ini normal saat block expired)
      if (!s.blockUntilTs || s.blockUntilTs <= now) {
        // Block expired, reset count (ini normal, tidak perlu warning)
        // PENTING: Log untuk debugging - ini penting untuk trace offense escalation
        console.info(`[LIMITER] 🔄 Block expired for ${userId}, resetting count ${before} → 0 (current offense: ${currentOffense}, will allow new actions)`);
        s.count = 0;
        before = 0; // Update before untuk logika selanjutnya
      } else {
        // Block masih aktif dan count sudah >= limit
        // Ini berarti inc() dipanggil tanpa cek can() dulu
        // PENTING: Jangan increment jika sudah blocked, tapi jangan warning karena ini bisa terjadi
        // (misalnya multiple concurrent requests)
        return before; // Return current count tanpa increment
      }
    }
    
    s.count += 1;

    // Strike-based escalation: when crossing limit, apply a block and increment offenses
    // PENTING: Offense hanya naik saat pertama kali mencapai limit (before < limit && s.count >= limit)
    // Bukan setiap kali inc() saat count >= limit (untuk mencegah offense naik berulang kali)
    // PENTING: Setelah block expired dan count di-reset, saat mencapai limit lagi, offense harus naik
    // PENTING: Kondisi ini akan terpenuhi ketika:
    //   - before < limit (count sebelum increment masih di bawah limit)
    //   - s.count >= limit (count setelah increment sudah mencapai atau melebihi limit)
    //   - Ini berarti user baru saja "crossing" limit, bukan sudah di atas limit
    if (this.escalateBlocks.length && before < this.limit && s.count >= this.limit) {
      // PENTING: Offense disimpan sebagai 1-based (offense 1 = 1, offense 2 = 2, offense 3 = 3)
      // Tapi array index adalah 0-based, jadi perlu convert: offenseIndex = currentOffense - 1
      // offense #1 (stored as 1) → index 0 → 30m
      // offense #2 (stored as 2) → index 1 → 60m
      // offense #3+ (stored as 3+) → index 2 → 24h
      let currentOffense = s.offenses || 0;
      
      // PENTING: Log untuk debugging progression offense
      // PENTING: Log ini penting untuk trace apakah offense naik dengan benar setelah block expired
      console.info(`[LIMITER] 🚨 User ${userId} crossing limit: before=${before}, count=${s.count}, currentOffense=${currentOffense}, will increment to offense #${currentOffense + 1}`);
      
      // PENTING: Validasi currentOffense tidak boleh lebih besar dari expected
      // Offense maksimal adalah escalateBlocks.length (karena 1-based)
      // Jika currentOffense > escalateBlocks.length, berarti ada bug atau data corrupt
      if (currentOffense > this.escalateBlocks.length) {
        console.warn(`[LIMITER] Warning: User ${userId} has invalid currentOffense (${currentOffense}) > max (${this.escalateBlocks.length}), resetting to 0`);
        currentOffense = 0;
        s.offenses = 0; // Reset offenses juga
      }
      
      // PENTING: Convert 1-based offense ke 0-based index
      // offense 1 → index 0, offense 2 → index 1, offense 3+ → index 2
      // Gunakan Math.max(0, currentOffense - 1) untuk convert, dan Math.min untuk cap di max index
      const offenseIndex = Math.min(Math.max(0, currentOffense - 1), this.escalateBlocks.length - 1);
      let blockMs = this.escalateBlocks[offenseIndex] || 0;
      
      // PENTING: Validasi blockMs harus sesuai dengan expected
      // Jika offense pertama (index 0) tapi blockMs = 24 jam, berarti ada bug di escalateBlocks array
      if (offenseIndex === 0 && blockMs === 24 * 60 * 60 * 1000) {
        console.error(`[LIMITER] ERROR: User ${userId} offense #1 (index 0) has blockMs = 24h! This is a bug! Expected 30m.`);
        console.error(`[LIMITER] ERROR: escalateBlocks array:`, this.escalateBlocks);
        console.error(`[LIMITER] ERROR: currentOffense: ${currentOffense}, offenseIndex: ${offenseIndex}`);
        // Force reset to correct value untuk mencegah block 24 jam
        const correctBlockMs = this.escalateBlocks[0] || (30 * 60 * 1000); // Fallback to 30m
        if (correctBlockMs > 0 && correctBlockMs !== blockMs) {
          console.error(`[LIMITER] ERROR: Fixing blockMs from ${this.format(blockMs)} to ${this.format(correctBlockMs)}`);
          blockMs = correctBlockMs;
        }
      }
      
      if (blockMs > 0) {
        const until = now + blockMs;
        const oldBlockUntilTs = s.blockUntilTs || 0;
        // PENTING: Math.max() untuk memastikan block time tidak berkurang jika ada block lama yang masih aktif
        // Tapi ini juga bisa menyebabkan masalah jika block lama masih aktif dengan waktu yang lebih lama
        s.blockUntilTs = Math.max(oldBlockUntilTs, until);
        // Increment offenses SETELAH menghitung blockMs
        const newOffense = currentOffense + 1;
        s.offenses = newOffense;
        console.info(`[LIMITER] ✅ User ${userId} offense #${newOffense} (index ${offenseIndex}, before=${before}, count=${s.count}, previousOffense=${currentOffense}) → blocked ${this.format(blockMs)} (oldBlock=${oldBlockUntilTs > 0 ? this.format(Math.max(0, oldBlockUntilTs - now)) : 'none'}, newBlock=${this.format(blockMs)})`);
      } else {
        // PENTING: Jika blockMs = 0, tetap increment offense untuk tracking
        const newOffense = currentOffense + 1;
        s.offenses = newOffense;
        console.warn(`[LIMITER] ⚠️ User ${userId} offense #${newOffense} but blockMs=0 (no block applied)`);
      }
    } else if (this.backoff.length) {
      // Fallback legacy behaviour (count-based backoff)
      for (let i = this.backoff.length - 1; i >= 0; i--) {
        const rule = this.backoff[i];
        if (s.count >= (rule.count || 0)) {
          const until = now + (rule.blockMs || 0);
          s.blockUntilTs = Math.max(s.blockUntilTs || 0, until);
          break;
        }
      }
    }

    this.map.set(userId, s);
    
    // PENTING: Debounced save untuk mencegah blocking (tidak save setiap increment)
    if (this.persistFile) {
      this.debouncedSave();
    }
    
    return before; // atau return { before, after: s.count }
  }

  reset(userId) {
    this.map.delete(userId);
    
    // PENTING: Debounced save untuk mencegah blocking
    if (this.persistFile) {
      this.debouncedSave();
    }
  }

  getCount(userId) {
    return this._state(userId).count;
  }

  getOffenses(userId) {
    return this._state(userId).offenses || 0;
  }

  remainingMs(userId) {
    const s = this._state(userId);
    const now = this._now();
    const windowRemain = Math.max(0, s.windowStart + this.windowMs - now);
    const blockRemain = Math.max(0, (s.blockUntilTs || 0) - now);
    return Math.max(windowRemain, blockRemain);
  }

  isBlocked(userId) {
    const s = this._state(userId);
    return (s.blockUntilTs || 0) > this._now();
  }

  blockRemainingMs(userId) {
    const s = this._state(userId); // PENTING: _state() akan update state jika block expired
    const now = this._now();
    const blockUntilTs = s.blockUntilTs || 0;
    const remaining = Math.max(0, blockUntilTs - now);
    // PENTING: Jika block sudah expired (remaining = 0) tapi blockUntilTs masih > 0, force clear
    // Ini untuk mencegah stuck di 0s - state harus di-update dengan benar
    if (remaining === 0 && blockUntilTs > 0 && blockUntilTs <= now) {
      // Block sudah expired tapi belum di-clear - force clear
      s.blockUntilTs = 0;
      // PENTING: Jika window belum expired, reset count juga agar user bisa create lagi
      const windowExpired = !s.windowStart || (now - s.windowStart) >= this.windowMs;
      if (!windowExpired && s.count > 0) {
        console.info(`[LIMITER] 🔄 Force clearing expired block for ${userId}: reset count ${s.count} → 0 (offenses: ${s.offenses || 0} preserved)`);
        s.count = 0;
      }
      this.map.set(userId, s);
    }
    return remaining;
  }

  getBlockTime(userId) {
    const s = this._state(userId);
    return s.blockUntilTs || null;
  }

  format(ms) {
    const sec = Math.ceil(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}j ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
  
  // PENTING: Debounced save untuk mencegah blocking - save setelah idle 1 detik
  debouncedSave() {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    // Set new timeout
    this.saveTimeout = setTimeout(() => {
      // PENTING: Call save dan catch error untuk memastikan tidak silent fail
      this.save().catch(e => {
        console.error(`[LIMITER] Error in debounced save for ${this.persistFile}:`, e.message);
      });
    }, this.saveDebounceMs);
  }
  
  // Save limiter state to file (async, non-blocking)
  async save() {
    if (!this.persistFile) return;
    
    // PENTING: Prevent concurrent saves
    if (this.savePending) {
      return; // Skip jika masih ada save yang sedang berjalan
    }
    
    this.savePending = true;
    
    try {
      const usersWithOffenses = Array.from(this.map.entries())
        .filter(([_, state]) => (state.offenses || 0) > 0)
        .map(([userId, state]) => ({ userId, offenses: state.offenses, count: state.count }));
      
      const data = {
        savedAt: this._now(),
        users: Array.from(this.map.entries()).map(([userId, state]) => ({
          userId,
          ...state
        }))
      };
      
      // PENTING: Atomic write - write ke temp file dulu, baru rename untuk mencegah corrupt
      const tempFile = `${this.persistFile}.tmp`;
      const jsonString = JSON.stringify(data, null, 2);
      
      // Write ke temp file dulu
      await fsPromises.writeFile(tempFile, jsonString, 'utf8');
      
      // Rename temp file ke actual file (atomic operation)
      await fsPromises.rename(tempFile, this.persistFile);
      
      // PENTING: Log untuk debugging - ini penting untuk trace apakah offense di-save dengan benar
      if (usersWithOffenses.length > 0) {
        console.info(`[LIMITER] 💾 Saved ${this.map.size} users to ${this.persistFile} (${usersWithOffenses.length} with offenses):`, usersWithOffenses);
      } else if (this.map.size > 0) {
        // Log juga jika ada data tapi tidak ada offense (untuk debugging)
        console.debug(`[LIMITER] 💾 Saved ${this.map.size} users to ${this.persistFile} (no offenses)`);
      }
    } catch (e) {
      console.error(`[LIMITER] Failed to save to ${this.persistFile}:`, e.message);
    } finally {
      this.savePending = false;
    }
  }
  
  // Load limiter state from file (async, non-blocking)
  async load() {
    if (!this.persistFile) return;
    
    try {
      // PENTING: Gunakan async access untuk non-blocking
      try {
        await fsPromises.access(this.persistFile);
      } catch {
        console.info(`[LIMITER] No persist file found at ${this.persistFile}, starting fresh`);
        return;
      }
      
      const raw = await fsPromises.readFile(this.persistFile, 'utf8');
      
      // PENTING: Validasi file tidak kosong atau hanya whitespace
      if (!raw || !raw.trim()) {
        console.warn(`[LIMITER] Persist file ${this.persistFile} is empty, starting fresh`);
        // Backup corrupt file dan start fresh
        try {
          await fsPromises.rename(this.persistFile, `${this.persistFile}.corrupt.${Date.now()}`);
        } catch (e) {
          // Ignore rename error
        }
        return;
      }
      
      // PENTING: Validasi JSON sebelum parse
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseError) {
        console.error(`[LIMITER] Invalid JSON in ${this.persistFile}: ${parseError.message}`);
        console.warn(`[LIMITER] Backup corrupt file and starting fresh`);
        // Backup corrupt file dan start fresh
        try {
          await fsPromises.rename(this.persistFile, `${this.persistFile}.corrupt.${Date.now()}`);
        } catch (e) {
          // Ignore rename error
        }
        return;
      }
      
      if (!data || !Array.isArray(data.users)) {
        console.warn(`[LIMITER] Invalid persist file format at ${this.persistFile}`);
        return;
      }
      
      const now = this._now();
      let loaded = 0;
      let expired = 0;
      
      for (const entry of data.users) {
        const { userId, count, windowStart, blockUntilTs, offenses } = entry;
        
        // PENTING: Cek window dan block expired
        const windowExpired = windowStart ? (now - windowStart) >= this.windowMs : true;
        const blockExpired = !blockUntilTs || blockUntilTs <= now;
        
        // PENTING: Jika window expired DAN block expired, skip (tidak perlu di-load)
        if (windowExpired && blockExpired) {
          expired++;
          continue;
        }
        
        // PENTING: Jika block expired tapi window belum expired, clear block dan reset count
        // Ini penting untuk mencegah stuck di 0s - user harus bisa create lagi setelah block expired
        const finalBlockUntilTs = (blockUntilTs && blockUntilTs > now) ? blockUntilTs : 0;
        // PENTING: Reset offenses ketika window expired, meskipun masih ada block aktif
        // Karena window adalah periode untuk track offense, jadi kalau window habis, offense harus di-reset
        let finalOffenses = windowExpired ? 0 : Math.max(0, offenses || 0);
        // PENTING: Reset count jika window expired ATAU block expired (tapi window belum expired)
        // Jika block expired tapi window belum expired, reset count agar user bisa create lagi
        // Ini penting untuk offense escalation: setelah block expired, count reset, lalu saat mencapai limit lagi, offense naik
        let finalCount = windowExpired ? 0 : (blockExpired ? 0 : Math.max(0, count || 0));
        const finalWindowStart = windowExpired ? now : (windowStart || now);
        
        // PENTING: Log untuk debugging - ini penting untuk trace state setelah load
        if (blockExpired && !windowExpired && (offenses || 0) > 0) {
          console.info(`[LIMITER] 🔄 Loaded user ${userId} with expired block: count=${count} → ${finalCount}, offenses=${offenses} (preserved), blockUntilTs cleared`);
        }
        
        // PENTING: Validasi data yang di-load untuk mencegah bug
        // Math.max() sudah handle negative, tapi kita tambahkan validasi tambahan untuk safety
        if (finalCount < 0) {
          console.warn(`[LIMITER] Warning: User ${userId} has negative count (${finalCount}) in persist file, resetting to 0`);
          finalCount = 0;
        }
        if (finalOffenses < 0) {
          console.warn(`[LIMITER] Warning: User ${userId} has negative offenses (${finalOffenses}) in persist file, resetting to 0`);
          finalOffenses = 0;
        }
        
        // PENTING: Validasi offenses tidak boleh lebih besar dari expected
        // PENTING: Offense disimpan sebagai 1-based (offense 1 = 1, offense 2 = 2, offense 3 = 3)
        // escalateBlocks.length = 3 (untuk offense 1, 2, 3)
        // Jadi offense maksimal adalah escalateBlocks.length (3)
        // Jika offenses > escalateBlocks.length, berarti ada bug atau data corrupt
        if (this.escalateBlocks.length > 0 && finalOffenses > this.escalateBlocks.length) {
          console.warn(`[LIMITER] Warning: User ${userId} has offenses (${finalOffenses}) > max (${this.escalateBlocks.length}), resetting to 0`);
          finalOffenses = 0;
        }
        
        // PENTING: Log untuk debugging - ini penting untuk trace apakah offense di-load dengan benar
        if (finalOffenses > 0) {
          console.info(`[LIMITER] 📥 Loaded user ${userId}: count=${finalCount}, offenses=${finalOffenses}, windowStart=${new Date(finalWindowStart).toISOString()}, blockUntilTs=${finalBlockUntilTs > 0 ? new Date(finalBlockUntilTs).toISOString() : 'none'}`);
        }
        
        this.map.set(userId, {
          count: finalCount,
          windowStart: finalWindowStart,
          blockUntilTs: finalBlockUntilTs,
          offenses: finalOffenses
        });
        loaded++;
      }
      
      console.info(`[LIMITER] ✅ Loaded ${loaded} users from ${this.persistFile} (${expired} expired entries skipped)`);
      
      // PENTING: Log summary untuk debugging
      if (loaded > 0) {
        const usersWithOffenses = Array.from(this.map.entries())
          .filter(([_, state]) => (state.offenses || 0) > 0)
          .map(([userId, state]) => ({ userId, offenses: state.offenses, count: state.count }));
        if (usersWithOffenses.length > 0) {
          console.info(`[LIMITER] 📊 Users with active offenses:`, usersWithOffenses);
        }
      }
    } catch (e) {
      console.error(`[LIMITER] Failed to load from ${this.persistFile}:`, e.message);
    }
  }
}

module.exports = { CounterLimiter };