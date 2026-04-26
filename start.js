module.exports = {
  apps: [
    {
      name: "atlab-rdp",
      script: "cursor.js",
      max_memory_restart: "500M",
      watch: false,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        TZ: "Asia/Jakarta"
      }
    }
  ]
}
