module.exports = {
  apps: [
    {
      // Application name for PM2 management
      name: 'rdp-web-panel',

      // Script to execute - using npm to run the start script
      script: 'npm',
      args: 'start',

      // Cluster mode for load balancing across multiple instances
      instances: 2,
      exec_mode: 'cluster',

      // Auto-restart on crash or unexpected exit
      autorestart: true,

      // Disable watch mode in production
      watch: false,

      // Memory threshold before automatic restart (prevents memory leaks)
      max_memory_restart: '1G',

      // Production environment variables
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Log file paths for error and standard output
      error_log: './logs/error.log',
      out_log: './logs/out.log',

      // Log timestamp format for better debugging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Graceful shutdown timeout (milliseconds)
      kill_timeout: 5000,

      // Wait time before considering app as crashed (milliseconds)
      listen_timeout: 3000,

      // Ignore watch patterns (if watch is enabled in future)
      ignore_watch: ['node_modules', '.next', 'logs'],

      // Environment-specific configuration
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
