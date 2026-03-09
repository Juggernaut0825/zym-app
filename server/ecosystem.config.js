module.exports = {
  apps: [
    {
      name: 'zym-server',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        WEBSOCKET_PORT: 8080,
        API_PORT: 3001
      }
    }
  ]
};
