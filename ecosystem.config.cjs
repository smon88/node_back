// ============================================
// Devil Panels - PM2 Ecosystem Configuration
// ============================================
// Copiar este archivo al directorio del backend Node
// y ejecutar: pm2 start ecosystem.config.js
//
// Comandos utiles:
//   pm2 start ecosystem.config.js
//   pm2 reload devil-backend
//   pm2 logs devil-backend
//   pm2 monit
// ============================================
module.exports = {
  apps: [
    {
      name: "devil-backend",
      cwd: "/var/www/node_back",
      script: "dist/src/main.ts",
      exec_mode: "fork",
      instances: 1,

      autorestart: true,
      watch: false,
      max_memory_restart: "500M",

      env: {
        NODE_ENV: "production",
        PORT: 3005,
      },

      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/pm2/node_back-error.log",
      out_file: "/var/log/pm2/node_back-out.log",
      merge_logs: true,

      kill_timeout: 5000,
    },
  ],
};
/* module.exports = {
  apps: [
    {
      name: 'devil-backend',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/node_back',
      instances: 'max',  // Usar todos los CPUs disponibles
      exec_mode: 'cluster',  // Modo cluster para mejor performance
      autorestart: true,
      watch: false,  // Deshabilitado en produccion
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pm2/node_back-error.log',
      out_file: '/var/log/pm2/node_back-out.log',
      merge_logs: true,
      // Restart policy
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    // WebSocket server (si es un proceso separado)
    // {
    //   name: 'devil-websocket',
    //   script: 'npm',
    //   args: 'run ws',
    //   cwd: '/var/www/devil-backend',
    //   instances: 1,  // WebSocket usualmente 1 instancia
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: '300M',
    //   env: {
    //     NODE_ENV: 'production',
    //     WS_PORT: 3000,
    //   },
    // },
  ],

  // Deploy configuration (opcional - para pm2 deploy)
  deploy: {
    production: {
      user: 'dev1lb0y',
      host: '3.13.53.146',
      ref: 'origin/main',
      repo: 'git@github.com:smon88/node_back.git',
      path: '/var/www/node_back',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
}; */
