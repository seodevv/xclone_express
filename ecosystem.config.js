module.exports = {
  apps: [
    {
      name: 'xClone_exp',
      script: './dist/app.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      // instances: 4,
      // exec_mode: 'cluster',
      watch: ['dist'],
      ignore_watch: [
        'node_modules',
        'src',
        'dist/logs',
        'dist/*.pid',
        'dist/data',
        'dist/uploads',
      ],
      max_memory_restart: '256M',
      env: {
        SERVER_HOST: '0.0.0.0',
        SERVER_PORT: '443',
        SERVER_ORIGIN: 'https://web.xclone.com:8443',
        SSL: true,
      },
      pid_file: './dist/xClone.pid',
      out_file: './dist/logs/xClone_exp.log',
      error_file: './dist/logs/xClone_err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
