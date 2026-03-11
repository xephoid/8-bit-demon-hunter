const install_args1 = ['install'];
const install_args2 = ['install', '--only=dev', '--no-shrinkwrap'];
const build_args_backend = ['run', 'build'];
const build_args_client = ['run', 'build'];

const backend_opts = { stdio: 'inherit', cwd: 'server', shell: true };
require('child_process').spawnSync('npm', install_args1, backend_opts);
require('child_process').spawnSync('npm', install_args2, backend_opts);

const client_opts = { stdio: 'inherit', cwd: 'client', shell: true };
require('child_process').spawnSync('npm', install_args1, client_opts);
require('child_process').spawnSync('npm', install_args2, client_opts);

let backend_results = require('child_process').spawnSync('npm', build_args_backend, backend_opts);
let client_results = require('child_process').spawnSync('npm', build_args_client, client_opts);

process.exit(backend_results.status || client_results.status);