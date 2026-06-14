import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface PagesDeployment {
    Id: string;
    Environment?: string;
    Branch?: string;
    Source?: string;
    Deployment?: string;
    Status?: string;
    Build?: string;
}

const WRANGLER_TOML = path.join(__dirname, '..', 'wrangler.toml');

function getProjectName(): string {
    const raw = fs.readFileSync(WRANGLER_TOML, 'utf8');
    const match = raw.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (!match) {
        throw new Error(`Could not parse 'name' from ${WRANGLER_TOML}`);
    }
    return match[1];
}

function listDeployments(projectName: string): PagesDeployment[] {
    const out = execSync(
        `npx wrangler pages deployment list --project-name ${projectName} --json`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
    );
    try {
        return JSON.parse(out) as PagesDeployment[];
    } catch (e) {
        throw new Error(`Failed to parse wrangler JSON output: ${(e as Error).message}`);
    }
}

async function main() {
    const projectName = getProjectName();
    console.log(`--- Pruning old Pages deployments for '${projectName}' ---`);

    let all: PagesDeployment[];
    try {
        all = listDeployments(projectName);
    } catch (e) {
        console.warn(`Could not list deployments (${(e as Error).message}). Skipping prune.`);
        return;
    }

    const production = all
        .filter((d) => (d.Environment ?? 'Production') === 'Production');

    if (production.length <= 1) {
        console.log(`Only ${production.length} production deployment(s). Nothing to prune.`);
        return;
    }

    // wrangler returns deployments newest-first; keep index 0.
    const keep = production[0];
    const toDelete = production.slice(1);

    console.log(`Keeping newest: ${keep.Id} (${keep.Status ?? '?'})`);
    console.log(`Deleting ${toDelete.length} older deployment(s)...`);

    let deleted = 0;
    let failed = 0;
    for (const dep of toDelete) {
        try {
            execSync(
                `npx wrangler pages deployment delete ${dep.Id} --project-name ${projectName} --force`,
                { stdio: 'inherit' }
            );
            deleted++;
            console.log(`  ✓ deleted ${dep.Id}`);
        } catch (e) {
            failed++;
            console.warn(`  ✗ failed to delete ${dep.Id}: ${(e as Error).message}`);
        }
    }

    console.log(`--- Prune complete. deleted=${deleted} failed=${failed} ---`);
}

main().catch((e) => {
    console.error(`prune-pages-deployments failed: ${(e as Error).message}`);
    // Non-fatal: do not break the deploy pipeline.
    process.exit(0);
});
