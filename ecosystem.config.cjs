module.exports = {
  apps: [
    {
      name: "eway",
      cwd: __dirname,
      script: "backend/src/index.js",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
