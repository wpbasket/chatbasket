import fs from 'fs';
import path from 'path';

const distDir = path.join(__dirname, '..', 'dist');
const assetsDir = path.join(distDir, 'assets');
const oldNodeModulesDir = path.join(assetsDir, 'node_modules');
const newFontsDir = path.join(assetsDir, 'fonts');
const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');

async function main() {
    console.log('--- Starting Cloudflare Pages Post-Build Fix ---');

    try {
        // 1. Rename dist/assets/node_modules to dist/assets/fonts
        if (fs.existsSync(oldNodeModulesDir)) {
            console.log(`Renaming ${oldNodeModulesDir} to ${newFontsDir}`);

            if (fs.existsSync(newFontsDir)) {
                await fs.promises.rm(newFontsDir, { recursive: true, force: true });
            }

            await fs.promises.rename(oldNodeModulesDir, newFontsDir);
        } else {
            console.log(`Directory ${oldNodeModulesDir} not found, checking if already renamed...`);
            if (!fs.existsSync(newFontsDir)) {
                console.warn('Neither old nor new fonts directory found. Font fix might not be needed.');
            }
        }

        // 2. Find Javascript bundle and replace references
        if (!fs.existsSync(jsDir)) {
            console.warn(`JS Directory ${jsDir} not found.`);
            return;
        }

        const files = await fs.promises.readdir(jsDir, { withFileTypes: true });

        // Process only JS files directly in the web bundle output
        // (Expo router bundles are usually flat in this directory)
        const jsFiles = files
            .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.js'))
            .map((dirent) => path.join(jsDir, dirent.name));

        if (jsFiles.length === 0) {
            console.log('No JS files found to process.');
            return;
        }

        console.log(`Scanning ${jsFiles.length} JS files to update asset references...`);

        let modifiedCount = 0;

        // Process files concurrently for better performance
        await Promise.all(
            jsFiles.map(async (fullPath) => {
                try {
                    const content = await fs.promises.readFile(fullPath, 'utf8');

                    // Fast check before doing a regex replace
                    if (content.includes('assets/node_modules/')) {
                        const newContent = content.replace(/assets\/node_modules\//g, 'assets/fonts/');
                        await fs.promises.writeFile(fullPath, newContent, 'utf8');
                        modifiedCount++;
                        console.log(`[Fixed] ${path.basename(fullPath)}`);
                    }
                } catch (err) {
                    console.error(`Error processing file ${fullPath}:`, err);
                }
            })
        );

        console.log(`--- Cloudflare Pages Post-Build Fix Completed (${modifiedCount} files updated) ---`);
    } catch (err) {
        console.error('Fatal error during execution:', err);
        process.exit(1);
    }
}

main();
