const fs = require('fs');
const path = require('path');

function resolveDistDir() {
  return process.env.NEXT_DIST_DIR || '.next';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  ensureDir(path.dirname(targetPath));
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true,
  });
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const distDir = resolveDistDir();
  const buildRoot = path.join(projectRoot, distDir);
  const standaloneRoot = path.join(buildRoot, 'standalone');
  const standaloneDistRoot = path.join(standaloneRoot, distDir);

  if (!fs.existsSync(standaloneRoot)) {
    throw new Error(`Standalone build output not found: ${standaloneRoot}`);
  }

  copyIfExists(path.join(buildRoot, 'static'), path.join(standaloneDistRoot, 'static'));
  copyIfExists(path.join(projectRoot, 'public'), path.join(standaloneRoot, 'public'));
}

main();
