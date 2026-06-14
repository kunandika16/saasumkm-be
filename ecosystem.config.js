module.exports = {
  apps: [{
    name: 'saasumkm-be',
    script: 'dist/index.js',
    cwd: '/home/ubuntu/saasumkm-be',
    env: {
      NODE_ENV: 'development',
    },
    watch: false,
    max_memory_restart: '500M',
    error_file: '/home/ubuntu/logs/saasumkm-be/err.log',
    out_file: '/home/ubuntu/logs/saasumkm-be/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
